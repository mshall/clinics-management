import { Injectable, Logger } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionService } from "./subscription.service";

const TRIAL_NOTICE_DAYS = 3;

@Injectable()
export class SubscriptionLifecycleService {
  private readonly log = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /** Idempotent daily pass: safe to run multiple times per day. */
  async runDailyLifecycle(now: Date = new Date()): Promise<{ processed: number }> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        status: {
          in: [
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.GRACE,
          ],
        },
      },
      select: { id: true, tenantId: true, status: true, trialEndsAt: true },
    });

    let processed = 0;
    for (const row of rows) {
      if (row.status === SubscriptionStatus.TRIALING && row.trialEndsAt) {
        const msToEnd = row.trialEndsAt.getTime() - now.getTime();
        const daysLeft = msToEnd / 86_400_000;
        if (daysLeft > 0 && daysLeft <= TRIAL_NOTICE_DAYS) {
          const sent = await this.subscriptions.recordTrialEndingNotice(row.id, row.tenantId, row.trialEndsAt);
          if (sent) processed += 1;
        }
        if (row.trialEndsAt <= now) {
          await this.subscriptions.activateSubscription(row.tenantId, null);
          processed += 1;
        }
      }

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