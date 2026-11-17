import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionLifecycleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SubscriptionLifecycleScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly lifecycle: SubscriptionLifecycleService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const result = await this.lifecycle.runDailyLifecycle();
      if (result.processed > 0) {
        this.log.log(`Subscription lifecycle (${label}): ${result.processed} transition(s)`);
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}