import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PrismaService } from "../prisma/prisma.service";
import { parseBillingPeriod } from "./settlement-period";
import {
  KIOREX_PROGRESS_NUDGE_THRESHOLDS,
  kiorexFreeProgressFromSettlement,
  type KiorexFreeProgress,
} from "./kiorex-progress";
import { SettlementService } from "./settlement.service";

function currentPeriodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class KiorexProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async getProgress(user: JwtUser, periodKey?: string): Promise<KiorexFreeProgress & { nudgesRecorded: number[] }> {
    const tenantId = requireTenantId(user);
    const key = (periodKey?.trim() || currentPeriodKey()).trim();
    parseBillingPeriod(key);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true, subscription: { select: { planPrice: { select: { currency: true } } } } },
    });
    const currency = tenant?.subscription?.planPrice?.currency ?? tenant?.baseCurrency ?? "EGP";

    const preview = await this.settlement.previewForTenant(user, tenantId, key);
    const fixed = kiorexFreeProgressFromSettlement(key, currency, preview.calculation);
    const nudgesRecorded = await this.recordThresholdNudges(tenantId, key, fixed.progressPercent);

    return { ...fixed, nudgesRecorded };
  }

  /** Idempotent: one audit row per tenant/period/threshold. */
  async recordThresholdNudges(tenantId: string, periodKey: string, progressPercent: number): Promise<number[]> {
    const recorded: number[] = [];
    for (const threshold of KIOREX_PROGRESS_NUDGE_THRESHOLDS) {
      if (progressPercent < threshold) continue;
      try {
        await this.prisma.kiorexProgressNudge.create({
          data: { tenantId, periodKey, threshold },
        });
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            action: `kiorex.progress.nudge_${threshold}`,
            resource: "KiorexProgress",
            resourceId: periodKey,
            metadata: { periodKey, threshold, progressPercent } as Prisma.InputJsonValue,
          },
        });
        recorded.push(threshold);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          continue;
        }
        throw e;
      }
    }
    return recorded;
  }
}