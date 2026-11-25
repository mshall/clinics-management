import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { TrialEngineService } from "./trial-engine.service";

@Injectable()
export class SubscriptionLifecycleService {
  private readonly log = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly trialEngine: TrialEngineService,
    private readonly renewal: SubscriptionRenewalService,
  ) {}

  /** Idempotent daily pass: safe to run multiple times per day. */
  async runDailyLifecycle(now: Date = new Date()): Promise<{ processed: number }> {
    const trialPass = await this.trialEngine.runDaily(now);
    let processed = trialPass.processed;

    // SUB-01: period end for every ACTIVE subscription: renew (auto-renew on), or move to Lite (auto-renew off / scheduled
    // cancel). Never CANCELLED/lockout. Reminders ride the same pass.
    const pass = await this.renewal.runDaily(now);
    processed += pass.downgraded + pass.renewed;

    return { processed };
  }
}