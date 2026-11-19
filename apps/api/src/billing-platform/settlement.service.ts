import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CommissionChargeStatus,
  KiorlyInvoiceStatus,
  PlanKey,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { KiorlyInvoicesService, type KiorlyInvoiceLineInput } from "./kiorly-invoices.service";
import { parseBillingPeriod } from "./settlement-period";
import { resolveSettlementMarketPack } from "./settlement-config";
import {
  computeSubscriptionAmounts,
  settlePeriod,
  type SettlementCalculatorInput,
} from "./settlement-calculator";
import { roundMoney } from "./settlement-rounding";

/**
 * SB-05: carry entering `periodKey`. Re-settling the period that last wrote the carry reuses the
 * carry that went into it, so a re-run never counts the same commission twice.
 */
export function resolveCarryForwardIn(
  tenant: {
    kiorlySettlementCarry: Prisma.Decimal | null;
    kiorlySettlementCarryPeriodKey: string | null;
    kiorlySettlementCarryIn: Prisma.Decimal | null;
  },
  periodKey: string,
): number {
  const lastKey = tenant.kiorlySettlementCarryPeriodKey;
  if (lastKey === periodKey) {
    return tenant.kiorlySettlementCarryIn ? Number(tenant.kiorlySettlementCarryIn) : 0;
  }
  if (lastKey && periodKey < lastKey) return 0;
  return tenant.kiorlySettlementCarry ? Number(tenant.kiorlySettlementCarry) : 0;
}

export type SettlementPreviewDto = {
  periodKey: string;
  dryRun: boolean;
  skippedBelowMinimum: boolean;
  carryForwardOut: string;
  invoiceId: string | null;
  invoiceStatus: KiorlyInvoiceStatus | null;
  calculation: ReturnType<typeof settlePeriod>;
};

@Injectable()
export class SettlementService {
  private readonly log = new Logger(SettlementService.name);
  private lastCairoBatchKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kiorlyInvoices: KiorlyInvoicesService,
  ) {}

  async previewForTenant(user: JwtUser, tenantId: string, periodKey: string): Promise<SettlementPreviewDto> {
    if (!isPlatformSuperAdmin(user) && user.tenantId !== tenantId) {
      throw new ForbiddenException();
    }
    return this.settlePeriod(tenantId, periodKey, { dryRun: true, actorUserId: user.userId });
  }

  async runForPlatform(user: JwtUser, body: { period: string; tenantIds?: string[] }): Promise<{
    periodKey: string;
    results: { tenantId: string; invoiceId: string | null; skipped: boolean; error?: string }[];
  }> {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can run settlement");
    }
    const periodKey = body.period.trim();
    parseBillingPeriod(periodKey);
    const tenantIds =
      body.tenantIds?.length ?
        body.tenantIds.map((id) => id.trim()).filter(Boolean)
      : (
          await this.prisma.tenant.findMany({
            where: { subscription: { isNot: null } },
            select: { id: true },
          })
        ).map((t) => t.id);

    const results: { tenantId: string; invoiceId: string | null; skipped: boolean; error?: string }[] = [];
    for (const tenantId of tenantIds) {
      try {
        const out = await this.settlePeriod(tenantId, periodKey, { dryRun: false, actorUserId: user.userId });
        results.push({
          tenantId,
          invoiceId: out.invoiceId,
          skipped: out.skippedBelowMinimum,
        });
      } catch (e) {
        results.push({
          tenantId,
          invoiceId: null,
          skipped: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { periodKey, results };
  }

  async settlePeriod(
    tenantId: string,
    periodKey: string,
    opts: { dryRun: boolean; actorUserId?: string },
  ): Promise<SettlementPreviewDto> {
    const { periodStart, periodEnd } = parseBillingPeriod(periodKey);
    const input = await this.buildCalculatorInput(tenantId, periodKey, periodStart, periodEnd);
    const calculation = settlePeriod(input);

    const existing = await this.prisma.kiorlyInvoice.findUnique({
      where: { tenantId_periodKey: { tenantId, periodKey } },
    });
    if (existing && existing.status !== KiorlyInvoiceStatus.DRAFT) {
      return {
        periodKey,
        dryRun: opts.dryRun,
        skippedBelowMinimum: calculation.summary.skippedBelowMinimum,
        carryForwardOut: calculation.summary.carryForwardOut,
        invoiceId: existing.id,
        invoiceStatus: existing.status,
        calculation,
      };
    }

    if (opts.dryRun) {
      return {
        periodKey,
        dryRun: true,
        skippedBelowMinimum: calculation.summary.skippedBelowMinimum,
        carryForwardOut: calculation.summary.carryForwardOut,
        invoiceId: existing?.id ?? null,
        invoiceStatus: existing?.status ?? null,
        calculation,
      };
    }

    if (calculation.summary.skippedBelowMinimum) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          kiorlySettlementCarry: new Prisma.Decimal(calculation.summary.carryForwardOut),
          kiorlySettlementCarryPeriodKey: periodKey,
          kiorlySettlementCarryIn: new Prisma.Decimal(input.carryForwardIn.toFixed(2)),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: opts.actorUserId ?? null,
          action: "kiorly.settlement.skipped_carry",
          resource: "Tenant",
          resourceId: tenantId,
          metadata: { periodKey, carry: calculation.summary.carryForwardOut } as Prisma.InputJsonValue,
        },
      });
      return {
        periodKey,
        dryRun: false,
        skippedBelowMinimum: true,
        carryForwardOut: calculation.summary.carryForwardOut,
        invoiceId: null,
        invoiceStatus: null,
        calculation,
      };
    }

    const lines = this.toInvoiceLines(calculation);
    const summaryJson = calculation.summary as unknown as Prisma.InputJsonValue;

    let invoiceId = existing?.id ?? null;
    if (!invoiceId && lines.length > 0) {
      const created = await this.kiorlyInvoices.createDraft(tenantId, {
        periodKey,
        periodStart,
        periodEnd,
        currency: input.currency,
        creditsApplied: calculation.creditsApplied,
        lines,
        taxRatePercent: input.taxRatePercent,
      });
      invoiceId = created.id;
      await this.prisma.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: { settlementSummaryJson: summaryJson },
      });
    } else if (invoiceId) {
      await this.kiorlyInvoices.replaceDraftLines(tenantId, invoiceId, lines, {
        creditsApplied: calculation.creditsApplied.toFixed(2),
        taxRatePercent: input.taxRatePercent,
      });
      await this.prisma.kiorlyInvoice.update({
        where: { id: invoiceId },
        data: { settlementSummaryJson: summaryJson },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (invoiceId) {
        await tx.kiorlyInvoice.update({
          where: { id: invoiceId },
          data: { settlementSummaryJson: summaryJson },
        });
      }

      const chargeIds = input.commissionItems.map((c) => c.chargeId);
      if (invoiceId && chargeIds.length > 0) {
        await tx.kiorexCommissionCharge.updateMany({
          where: {
            tenantId,
            id: { in: chargeIds },
            status: CommissionChargeStatus.CONFIRMED,
          },
          data: {
            status: CommissionChargeStatus.BILLED,
            kiorlyInvoiceId: invoiceId,
          },
        });
      }

      if (invoiceId && input.planKey === PlanKey.LITE && input.carryForwardIn > 0) {
        await tx.kiorexCommissionCharge.updateMany({
          where: {
            tenantId,
            status: CommissionChargeStatus.CONFIRMED,
            kiorlyInvoiceId: null,
            attendedAt: { lt: periodStart },
          },
          data: {
            status: CommissionChargeStatus.BILLED,
            kiorlyInvoiceId: invoiceId,
          },
        });
      }

      const carryOut = Number(calculation.summary.carryForwardOut);
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          kiorlySettlementCarry: carryOut > 0 ? new Prisma.Decimal(carryOut.toFixed(2)) : null,
          kiorlySettlementCarryPeriodKey: periodKey,
          kiorlySettlementCarryIn: new Prisma.Decimal(input.carryForwardIn.toFixed(2)),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: opts.actorUserId ?? null,
          action: "kiorly.settlement.completed",
          resource: "KiorlyInvoice",
          resourceId: invoiceId,
          metadata: { periodKey, total: calculation.total.toFixed(2) } as Prisma.InputJsonValue,
        },
      });
    });

    return {
      periodKey,
      dryRun: false,
      skippedBelowMinimum: false,
      carryForwardOut: calculation.summary.carryForwardOut,
      invoiceId,
      invoiceStatus: KiorlyInvoiceStatus.DRAFT,
      calculation,
    };
  }

  private toInvoiceLines(calculation: ReturnType<typeof settlePeriod>): KiorlyInvoiceLineInput[] {
    const lines: KiorlyInvoiceLineInput[] = calculation.lines.map((line) => ({
      type: line.type,
      descEn: line.descEn,
      descAr: line.descAr,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      amount: line.amount,
      refId: line.refId,
    }));
    return lines;
  }

  private async buildCalculatorInput(
    tenantId: string,
    periodKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SettlementCalculatorInput> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        market: true,
        subscription: { include: { plan: true, planPrice: true } },
        creditWallet: true,
      },
    });
    if (!tenant) throw new NotFoundException("Organization not found");
    if (!tenant.subscription) throw new BadRequestException("Subscription required for settlement");
    const sub = tenant.subscription;
    const pack = resolveSettlementMarketPack(
      tenant.market?.featureDefaults,
      sub.trialConfigOverride,
    );
    const currency = sub.planPrice?.currency ?? tenant.baseCurrency;

    const trialCoversPeriod =
      sub.status === SubscriptionStatus.TRIALING &&
      sub.trialEndsAt != null &&
      periodEnd <= sub.trialEndsAt;

    const prepaidCoversPeriod =
      sub.prepaidUntil != null && sub.prepaidUntil >= periodEnd;

    const subscriptionBillable =
      !trialCoversPeriod &&
      sub.status !== SubscriptionStatus.CANCELLED &&
      (sub.plan.key !== PlanKey.LITE || false);

    let subscriptionDue = 0;
    let subscriptionList = 0;
    let seatDue = 0;
    let seatCount = 0;
    let seatUnitPrice = 0;

    if (subscriptionBillable && sub.planPrice && sub.plan.key !== PlanKey.LITE) {
      const amounts = computeSubscriptionAmounts({
        planUnit: sub.planPrice.unit,
        baseAmount: Number(sub.planPrice.amount),
        clinicianSeats: sub.clinicianSeats,
        includedClinicians: sub.planPrice.includedClinicians,
        extraClinicianAmount: sub.planPrice.extraClinicianAmount
          ? Number(sub.planPrice.extraClinicianAmount)
          : null,
      });
      subscriptionList = amounts.subscriptionList;
      seatDue = amounts.seatDue;
      seatCount = amounts.seatCount;
      seatUnitPrice = amounts.seatUnitPrice;
      subscriptionDue = prepaidCoversPeriod ? 0 : roundMoney(subscriptionList + seatDue);
    }

    const referencePlanPrice = sub.planPrice ? Number(sub.planPrice.amount) : 0;

    const charges = await this.prisma.kiorexCommissionCharge.findMany({
      where: {
        tenantId,
        status: { in: [CommissionChargeStatus.CONFIRMED, CommissionChargeStatus.BILLED] },
        attendedAt: { gte: periodStart, lt: periodEnd },
      },
      include: {
        patient: { select: { firstNameEn: true, lastNameEn: true } },
      },
    });

    const commissionItems = charges.map((c) => ({
      chargeId: c.id,
      amount: Number(c.amount),
      patientInitials:
        `${c.patient.firstNameEn?.trim()?.[0] ?? ""}${c.patient.lastNameEn?.trim()?.[0] ?? ""}`.toUpperCase() ||
        "—",
    }));
    const commissionGrossBeforeCap = roundMoney(commissionItems.reduce((s, i) => s + i.amount, 0));

    const walletBalance = tenant.creditWallet ? Number(tenant.creditWallet.balance) : 0;
    const carryIn = resolveCarryForwardIn(tenant, periodKey);

    return {
      periodKey,
      currency,
      planKey: sub.plan.key,
      subscriptionDue,
      subscriptionList: trialCoversPeriod ? 0 : subscriptionList,
      seatDue: trialCoversPeriod ? 0 : seatDue,
      seatCount,
      seatUnitPrice,
      addons: [],
      usageOverage: 0,
      commissionItems,
      commissionGrossBeforeCap,
      liteMonthlyCap: pack.liteMonthlyCap,
      trialCoversPeriod,
      trialCommissionPolicy: pack.trialCommissionPolicy,
      referencePlanPrice,
      prepaidCoversPeriod,
      walletCreditAvailable: Math.max(0, walletBalance),
      carryForwardIn: sub.plan.key === PlanKey.LITE ? carryIn : 0,
      liteMinInvoice: pack.liteMinInvoice,
      taxRatePercent: pack.taxRatePercent,
    };
  }

  /** Hourly hook: run batch once on day 1 @ 02:00 Africa/Cairo for previous month. */
  async maybeRunCairoMonthlyBatch(): Promise<void> {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    if (day !== 1 || hour !== 2) return;

    const batchKey = `${year}-${month}`;
    if (this.lastCairoBatchKey === batchKey) return;
    this.lastCairoBatchKey = batchKey;

    const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const periodKey = `${prevMonth.y}-${String(prevMonth.m).padStart(2, "0")}`;
    this.log.log(`Running Cairo monthly settlement for ${periodKey}`);

    const tenants = await this.prisma.tenant.findMany({
      where: { subscription: { isNot: null } },
      select: { id: true },
    });
    for (const { id } of tenants) {
      try {
        await this.settlePeriod(id, periodKey, { dryRun: false });
      } catch (e) {
        this.log.warn(`Settlement failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}