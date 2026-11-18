import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { KiorlyLineType, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildMonthlyStatement,
  renderMonthlyStatementPdf,
  statementSourceFromSettlement,
  type MonthlyStatementDto,
  type StatementPatientRow,
  type StatementSourceLine,
} from "./monthly-statement";
import { resolveSettlementMarketPack } from "./settlement-config";
import { parseBillingPeriod } from "./settlement-period";
import { roundMoney } from "./settlement-rounding";
import { SettlementService } from "./settlement.service";

export type MonthlyStatementListItem = {
  periodKey: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  total: string;
  amountDue: string;
  issuedAt: string | null;
};

const CARRY_FORWARD_REF = "carry-forward";

@Injectable()
export class MonthlyStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  private assertTenant(user: JwtUser, tenantId: string): void {
    if (!isPlatformSuperAdmin(user) && user.tenantId !== tenantId) throw new ForbiddenException();
  }

  private normalizePeriod(periodKey: string): string {
    try {
      return parseBillingPeriod(periodKey).periodKey;
    } catch {
      throw new BadRequestException("period must be YYYY-MM");
    }
  }

  async listForTenant(user: JwtUser, tenantId: string): Promise<{ items: MonthlyStatementListItem[] }> {
    this.assertTenant(user, tenantId);
    const rows = await this.prisma.kiorlyInvoice.findMany({
      where: { tenantId, creditMemo: false },
      orderBy: { periodStart: "desc" },
      take: 36,
    });
    return {
      items: rows.map((row) => ({
        periodKey: row.periodKey,
        invoiceId: row.id,
        invoiceNumber: row.number,
        status: row.status,
        currency: row.currency,
        total: row.total.toFixed(2),
        amountDue: Prisma.Decimal.max(row.total.sub(row.amountPaid), new Prisma.Decimal(0)).toFixed(2),
        issuedAt: row.issuedAt?.toISOString() ?? null,
      })),
    };
  }

  async getForTenant(user: JwtUser, tenantId: string, periodKeyRaw: string): Promise<MonthlyStatementDto> {
    this.assertTenant(user, tenantId);
    return this.getForPeriod(tenantId, periodKeyRaw);
  }

  async renderPdfForTenant(
    user: JwtUser,
    tenantId: string,
    periodKeyRaw: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    const statement = await this.getForTenant(user, tenantId, periodKeyRaw);
    return {
      pdf: renderMonthlyStatementPdf(statement),
      filename: `kiorly-statement-${statement.periodKey}.pdf`,
    };
  }

  async getForPeriod(tenantId: string, periodKeyRaw: string): Promise<MonthlyStatementDto> {
    const periodKey = this.normalizePeriod(periodKeyRaw);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { market: true, creditWallet: true, subscription: true },
    });
    if (!tenant) throw new NotFoundException("Organization not found");
    const walletBalance = tenant.creditWallet ? Number(tenant.creditWallet.balance) : 0;
    const pack = resolveSettlementMarketPack(tenant.market?.featureDefaults, tenant.subscription?.trialConfigOverride);

    const invoice = await this.prisma.kiorlyInvoice.findUnique({
      where: { tenantId_periodKey: { tenantId, periodKey } },
      include: {
        lines: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!invoice) {
      let preview;
      try {
        preview = await this.settlement.settlePeriod(tenantId, periodKey, { dryRun: true });
      } catch (e) {
        if (e instanceof BadRequestException || e instanceof NotFoundException) {
          throw new NotFoundException("No statement for this period");
        }
        throw e;
      }
      const patients = await this.patientRows(tenantId, preview.calculation.lines);
      const currency = tenant.baseCurrency;
      return buildMonthlyStatement(
        statementSourceFromSettlement(periodKey, currency, pack.taxRatePercent, preview.calculation, {
          patients,
          walletBalance,
        }),
      );
    }

    const lines: StatementSourceLine[] = invoice.lines.map((l) => ({
      type: l.type,
      descEn: l.descEn,
      descAr: l.descAr,
      amount: l.amount.toFixed(2),
      refId: l.refId,
    }));
    const summary = parseSummary(invoice.settlementSummaryJson);
    const taxable = Number(invoice.subtotal.sub(invoice.creditsApplied));
    const tax = Number(invoice.tax);
    const vatRatePercent = taxable > 0 && tax > 0 ? roundMoney((tax / taxable) * 100) : pack.taxRatePercent;

    return buildMonthlyStatement({
      periodKey,
      currency: invoice.currency,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        dueAt: invoice.dueAt?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
      },
      lines,
      creditsApplied: invoice.creditsApplied.toFixed(2),
      tax: invoice.tax.toFixed(2),
      amountPaid: invoice.amountPaid.toFixed(2),
      expected: { subtotal: invoice.subtotal.toFixed(2), total: invoice.total.toFixed(2) },
      patients: await this.patientRows(tenantId, lines),
      payments: invoice.payments.map((p) => ({
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        provider: p.provider,
        amount: p.amount.toFixed(2),
        currency: p.currency,
        status: p.status,
      })),
      walletBalance,
      vatRatePercent,
      explanationEn: summary.explanationEn,
      explanationAr: summary.explanationAr,
      skippedBelowMinimum: summary.skippedBelowMinimum,
      carryForwardOut: summary.carryForwardOut,
    });
  }

  /** One row per billed Kiorex commission line; fee is the billed line amount (after any cap scaling). */
  private async patientRows(
    tenantId: string,
    lines: { type: KiorlyLineType; amount: number | string; refId?: string | null }[],
  ): Promise<StatementPatientRow[]> {
    const commissionLines = lines.filter(
      (l) => l.type === KiorlyLineType.KIOREX_COMMISSION && l.refId && l.refId !== CARRY_FORWARD_REF,
    );
    if (commissionLines.length === 0) return [];
    const charges = await this.prisma.kiorexCommissionCharge.findMany({
      where: { tenantId, id: { in: commissionLines.map((l) => l.refId!) } },
      include: {
        patient: { select: { firstNameEn: true, lastNameEn: true } },
        clinician: { select: { displayName: true } },
      },
    });
    const byId = new Map(charges.map((c) => [c.id, c]));
    return commissionLines
      .map((line) => {
        const charge = byId.get(line.refId!);
        if (!charge) return null;
        return {
          chargeId: charge.id,
          attendedAt: charge.attendedAt.toISOString(),
          doctorName: charge.clinician.displayName?.trim() || "—",
          patientInitials:
            `${charge.patient.firstNameEn?.trim()?.[0] ?? ""}${charge.patient.lastNameEn?.trim()?.[0] ?? ""}`.toUpperCase() ||
            "—",
          fee: roundMoney(Number(line.amount)).toFixed(2),
        };
      })
      .filter((row): row is StatementPatientRow => row != null)
      .sort((a, b) => a.attendedAt.localeCompare(b.attendedAt));
  }
}

function parseSummary(json: Prisma.JsonValue | null): {
  explanationEn: string | null;
  explanationAr: string | null;
  skippedBelowMinimum: boolean;
  carryForwardOut: string;
} {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  return {
    explanationEn: typeof o.explanationEn === "string" ? o.explanationEn : null,
    explanationAr: typeof o.explanationAr === "string" ? o.explanationAr : null,
    skippedBelowMinimum: o.skippedBelowMinimum === true,
    carryForwardOut: typeof o.carryForwardOut === "string" ? o.carryForwardOut : "0.00",
  };
}
