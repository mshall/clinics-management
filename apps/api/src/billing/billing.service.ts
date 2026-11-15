import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { queueEtaReceipt } from "../compliance/eta-receipt-queue";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { flattenBillingPaymentAllocations, sumExpectedCashAndCard } from "./billing-cash-close";

const DISCOUNT_APPROVAL_THRESHOLD = 15;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(role: UserRole | undefined) {
    const ok: UserRole[] = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.FINANCE_OFFICER, UserRole.BRANCH_MANAGER];
    if (!role || !ok.includes(role)) throw new BadRequestException("Insufficient permissions for billing setup");
  }

  async listCatalog(tenantId: string, q?: string) {
    const where: Prisma.ServiceCatalogItemWhereInput = { tenantId, active: true };
    if (q?.trim()) {
      where.OR = [
        { code: { contains: q.trim(), mode: "insensitive" } },
        { nameEn: { contains: q.trim(), mode: "insensitive" } },
        { nameAr: { contains: q.trim(), mode: "insensitive" } },
      ];
    }
    const items = await this.prisma.serviceCatalogItem.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        prices: { orderBy: { effectiveFrom: "desc" }, take: 3 },
      },
    });
    return { items };
  }

  async createCatalogItem(
    tenantId: string,
    user: JwtUser,
    body: { code: string; nameEn: string; nameAr?: string; category?: string; amount: number; currency?: string },
  ) {
    this.assertAdmin(user.role);
    const code = body.code.trim().toUpperCase();
    if (!code) throw new BadRequestException("Service code is required");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currency = await this.resolveTenantCurrency(tenantId, body.currency);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.serviceCatalogItem.create({
        data: {
          tenantId,
          code,
          nameEn: body.nameEn.trim(),
          nameAr: body.nameAr?.trim() ?? "",
          category: body.category?.trim() || "GENERAL",
        },
      });
      await tx.servicePrice.create({
        data: {
          tenantId,
          catalogItemId: item.id,
          effectiveFrom: today,
          amount: new Prisma.Decimal(String(body.amount)),
          currency,
        },
      });
      return item;
    });
  }

  resolvePrice(
    tenantId: string,
    catalogItemId: string,
    asOf: Date,
    payerCompanyId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const asOfDate = new Date(asOf);
      asOfDate.setHours(0, 0, 0, 0);
      if (payerCompanyId) {
        const contract = await tx.contractServicePrice.findFirst({
          where: {
            tenantId,
            payerCompanyId,
            catalogItemId,
            effectiveFrom: { lte: asOfDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
          },
          orderBy: { effectiveFrom: "desc" },
        });
        if (contract) return { amount: Number(contract.amount), currency: contract.currency, source: "CONTRACT" as const };
      }
      const list = await tx.servicePrice.findFirst({
        where: {
          tenantId,
          catalogItemId,
          effectiveFrom: { lte: asOfDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (!list) throw new NotFoundException("No price effective for this date");
      return { amount: Number(list.amount), currency: list.currency, source: "LIST" as const };
    });
  }

  private async resolveTenantCurrency(tenantId: string, override?: string): Promise<string> {
    const o = override?.trim();
    if (o) return o;
    const ctx = await resolveMarketForTenant(this.prisma, tenantId);
    return ctx.currency;
  }

  async recordPayment(
    tenantId: string,
    user: JwtUser,
    body: {
      clinicId: string;
      patientId: string;
      invoiceId?: string;
      currency?: string;
      allocations: { method: PaymentMethod; amount: number }[];
      submitEta?: boolean;
    },
  ) {
    if (!body.allocations.length) throw new BadRequestException("At least one payment allocation is required");
    const total = body.allocations.reduce((s, a) => s + a.amount, 0);
    if (total <= 0) throw new BadRequestException("Payment total must be positive");

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: body.clinicId, tenantId },
      select: { taxRegistrationNumber: true, invoiceVatPercent: true },
    });
    const currency = await this.resolveTenantCurrency(tenantId, body.currency);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.billingPayment.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          invoiceId: body.invoiceId,
          totalAmount: new Prisma.Decimal(String(total)),
          currency,
          cashierUserId: user.userId,
          allocations: {
            create: body.allocations.map((a) => ({
              method: a.method,
              amount: new Prisma.Decimal(String(a.amount)),
            })),
          },
        },
        include: { allocations: true },
      });
      if (body.submitEta !== false) {
        await queueEtaReceipt(tx, {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          paymentId: payment.id,
          totalAmount: total,
          currency: payment.currency,
          vatPercent: Number(clinic?.invoiceVatPercent ?? 0),
          description: `Billing payment ${payment.id.slice(0, 8)}…`,
          clinicTaxRin: clinic?.taxRegistrationNumber,
        });
      }
      return payment;
    });
  }

  async closeCashierShift(
    tenantId: string,
    user: JwtUser,
    body: {
      clinicId: string;
      shiftDate: string;
      countedCash: number;
      countedCard: number;
      notes?: string;
    },
  ) {
    const day = new Date(body.shiftDate);
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const payments = await this.prisma.billingPayment.findMany({
      where: { tenantId, clinicId: body.clinicId, createdAt: { gte: day, lt: dayEnd } },
      include: { allocations: true },
    });
    const flat = flattenBillingPaymentAllocations(
      payments.map((p) => ({
        allocations: p.allocations.map((a) => ({ method: a.method, amount: Number(a.amount) })),
      })),
    );
    const { expectedCash, expectedCard } = sumExpectedCashAndCard(flat);

    return this.prisma.cashierShiftClose.create({
      data: {
        tenantId,
        clinicId: body.clinicId,
        cashierUserId: user.userId,
        shiftDate: day,
        expectedCash: new Prisma.Decimal(String(expectedCash)),
        countedCash: new Prisma.Decimal(String(body.countedCash)),
        expectedCard: new Prisma.Decimal(String(expectedCard)),
        countedCard: new Prisma.Decimal(String(body.countedCard)),
        notes: body.notes?.trim() || null,
      },
    });
  }

  discountNeedsManagerApproval(discountPercent: number): boolean {
    return discountPercent > DISCOUNT_APPROVAL_THRESHOLD;
  }
}
