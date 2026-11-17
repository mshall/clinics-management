import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CreditWalletService } from "./credit-wallet.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreditWalletScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CreditWalletScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly credits: CreditWalletService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const result = await this.credits.runDailyCreditMaintenance();
      if (result.expiredWallets > 0 || result.repairedWallets > 0) {
        this.log.log(
          `Credit wallet maintenance (${label}): expired ${result.expiredWallets} wallet(s), reconciled ${result.repairedWallets}`,
        );
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}