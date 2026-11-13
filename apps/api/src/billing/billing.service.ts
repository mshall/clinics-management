import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EtaReceiptStatus, PaymentMethod, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";

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
          currency: body.currency?.trim() || "EGP",
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

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.billingPayment.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          patientId: body.patientId,
          invoiceId: body.invoiceId,
          totalAmount: new Prisma.Decimal(String(total)),
          currency: body.currency?.trim() || "EGP",
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
        await tx.etaReceiptSubmission.create({
          data: {
            tenantId,
            clinicId: body.clinicId,
            patientId: body.patientId,
            paymentId: payment.id,
            status: EtaReceiptStatus.PENDING,
            payloadJson: {
              note: "ETA e-receipt queue stub — wire Egypt ETA SDK/credentials before production",
              total,
              currency: payment.currency,
            },
          },
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
    let expectedCash = 0;
    let expectedCard = 0;
    for (const p of payments) {
      for (const a of p.allocations) {
        const amt = Number(a.amount);
        if (a.method === PaymentMethod.CASH) expectedCash += amt;
        else if (a.method === PaymentMethod.CARD) expectedCard += amt;
      }
    }

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
