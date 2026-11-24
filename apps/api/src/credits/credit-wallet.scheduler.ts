import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CreditReconcileService } from "./credit-reconcile.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreditWalletScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CreditWalletScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly credits: CreditReconcileService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const result = await this.credits.run();
      if (result.expired > 0 || result.repaired > 0 || result.mismatches > 0) {
        this.log.log(
          `Credit wallet maintenance (${label}): expired ${result.expired} wallet(s), reconciled ${result.repaired}, mismatches ${result.mismatches}`,
        );
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}