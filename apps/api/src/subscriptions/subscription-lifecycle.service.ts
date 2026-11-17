import { Injectable, Logger } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionService } from "./subscription.service";
import { TrialEngineService } from "./trial-engine.service";

@Injectable()
export class SubscriptionLifecycleService {
  private readonly log = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly trialEngine: TrialEngineService,
  ) {}

  /** Idempotent daily pass: safe to run multiple times per day. */
  async runDailyLifecycle(now: Date = new Date()): Promise<{ processed: number }> {
    const trialPass = await this.trialEngine.runDaily(now);
    let processed = trialPass.processed;

    const rows = await this.prisma.subscription.findMany({
      where: {
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.GRACE,
          ],
        },
      },
      select: { id: true, tenantId: true, status: true, trialEndsAt: true },
    });

    for (const row of rows) {
      if (row.status === SubscriptionStatus.ACTIVE) {
        const cancelled = await this.subscriptions.completeCancellationAtPeriodEnd(row.tenantId, null);
        if (cancelled) {
          processed += 1;
          continue;
        }
        const rolled = await this.subscriptions.rollBillingPeriod(row.tenantId, null);
        if (rolled) processed += 1;
      }
    }

    return { processed };
  }
}