import { Injectable, Logger } from "@nestjs/common";
import { AppointmentStatus, BillingInterval, CreditReason, PlanKey, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveNoShowGuaranteeConfig } from "../markets/commercial-config.schema";
import { PrismaService } from "../prisma/prisma.service";
import {
  calculateNoShowGuarantee,
  daysSince,
  NO_SHOW_GUARANTEE_SOURCE_REF,
  type GuaranteeAppointmentRow,
} from "./no-show-guarantee";

const ELIGIBLE_PLANS = new Set<PlanKey>([PlanKey.PRO, PlanKey.CLINIC, PlanKey.ENTERPRISE]);

@Injectable()
export class NoShowGuaranteeService {
  private readonly log = new Logger(NoShowGuaranteeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async getForTenant(user: JwtUser, tenantId: string, now = new Date()) {
    return this.buildStatus(tenantId, now, { grantIfDue: false });
  }

  /** Daily job: evaluate tenants past evaluationDay and grant when met. */
  async runDailyEvaluation(now = new Date()): Promise<{ evaluated: number; granted: number }> {
    const progress = await this.prisma.onboardingProgress.findMany({
      where: { activatedAt: { not: null } },
      select: { tenantId: true },
      take: 5000,
    });
    let evaluated = 0;
    let granted = 0;
    for (const row of progress) {
      try {
        const status = await this.buildStatus(row.tenantId, now, { grantIfDue: true });
        evaluated += 1;
        if (status.granted && status.grantJustCreated) granted += 1;
      } catch (e) {
        this.log.warn(`guarantee eval ${row.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { evaluated, granted };
  }

  private async buildStatus(
    tenantId: string,
    now: Date,
    opts: { grantIfDue: boolean },
  ): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        market: { select: { commercialConfig: true } },
        subscription: { include: { planPrice: true, plan: true } },
        onboardingProgress: { select: { activatedAt: true } },
      },
    });
    if (!tenant) {
      return { enabled: false, reason: "TENANT_NOT_FOUND" };
    }

    const config = resolveNoShowGuaranteeConfig(tenant.market?.commercialConfig);
    if (!config.enabled) {
      return {
        enabled: false,
        targetReductionPercent: config.targetReductionPercent,
        creditMonths: config.creditMonths,
        reason: "DISABLED",
      };
    }

    const planKey = tenant.subscription?.plan?.key;
    const activatedAt = tenant.onboardingProgress?.activatedAt ?? null;
    const remindersOk = await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders");
    const depositsOk = await this.entitlements.isEntitled(tenantId, "deposits");

    const ineligibility: string[] = [];
    if (!planKey || !ELIGIBLE_PLANS.has(planKey)) ineligibility.push("PLAN");
    if (!activatedAt) ineligibility.push("NOT_ACTIVATED");
    if (!remindersOk) ineligibility.push("REMINDERS_DISABLED");
    if (!depositsOk) ineligibility.push("DEPOSITS_DISABLED");

    const sourceRef = NO_SHOW_GUARANTEE_SOURCE_REF(tenantId);
    const existingGrant = await this.prisma.creditLedgerEntry.findFirst({
      where: { reason: CreditReason.NO_SHOW_GUARANTEE, sourceRef },
      select: { id: true, amount: true, createdAt: true },
    });

    if (!activatedAt || ineligibility.length > 0) {
      return {
        enabled: true,
        eligible: false,
        ineligibilityReasons: ineligibility,
        activatedAt: activatedAt?.toISOString() ?? null,
        dayIndex: activatedAt ? daysSince(activatedAt, now) : null,
        targetReductionPercent: config.targetReductionPercent,
        creditMonths: config.creditMonths,
        granted: Boolean(existingGrant),
        grantEntryId: existingGrant?.id ?? null,
        config,
      };
    }

    const windowEnd = new Date(
      activatedAt.getTime() + config.evaluationDay * 86_400_000,
    );
    const rows = await this.loadOutcomes(tenantId, activatedAt, windowEnd > now ? now : windowEnd);
    const calc = calculateNoShowGuarantee(rows, activatedAt, now, config);

    let grantJustCreated = false;
    let grantEntryId = existingGrant?.id ?? null;

    if (
      opts.grantIfDue &&
      !existingGrant &&
      calc.met &&
      ineligibility.length === 0
    ) {
      const monthly = this.oneMonthCreditAmount(tenant.subscription?.planPrice);
      const amount = monthly.mul(config.creditMonths);
      if (amount.gt(0)) {
        const entry = await this.wallet.grantInTransaction({
          tenantId,
          amount,
          reason: CreditReason.NO_SHOW_GUARANTEE,
          sourceRef,
          note: `No-show guarantee: ${calc.reductionPercent}% reduction (target ${config.targetReductionPercent}%)`,
          metadata: {
            baselineRate: calc.baseline.rate,
            evaluationRate: calc.evaluation.rate,
            reductionPercent: calc.reductionPercent,
            creditMonths: config.creditMonths,
          },
        });
        grantEntryId = entry.id;
        grantJustCreated = true;
      }
    }

    return {
      enabled: true,
      eligible: calc.baselineEligible && ineligibility.length === 0,
      ineligibilityReasons: ineligibility,
      activatedAt: activatedAt.toISOString(),
      dayIndex: daysSince(activatedAt, now),
      baseline: serializeWindow(calc.baseline),
      evaluation: serializeWindow(calc.evaluation),
      reductionPercent: calc.reductionPercent,
      targetReductionPercent: calc.targetReductionPercent,
      creditMonths: config.creditMonths,
      met: calc.met,
      baselineEligible: calc.baselineEligible,
      evaluationComplete: calc.evaluationComplete,
      granted: Boolean(grantEntryId),
      grantEntryId,
      grantJustCreated,
      config,
    };
  }

  private async loadOutcomes(tenantId: string, from: Date, to: Date): Promise<GuaranteeAppointmentRow[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startsAt: { gte: from, lt: to },
        status: { in: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] },
      },
      select: { status: true, startsAt: true },
    });
    return rows.map((r) => ({ status: r.status, startsAt: r.startsAt }));
  }

  private oneMonthCreditAmount(
    planPrice: { amount: Prisma.Decimal; interval: BillingInterval } | null | undefined,
  ): Prisma.Decimal {
    if (!planPrice) return new Prisma.Decimal(0);
    if (planPrice.interval === BillingInterval.ANNUAL) return planPrice.amount.div(12);
    return planPrice.amount;
  }
}

function serializeWindow(w: {
  from: Date;
  to: Date;
  appointments: number;
  noShows: number;
  rate: number;
}) {
  return {
    from: w.from.toISOString(),
    to: w.to.toISOString(),
    appointments: w.appointments,
    noShows: w.noShows,
    rate: w.rate,
  };
}
