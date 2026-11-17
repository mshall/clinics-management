import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CommissionChargeService } from "./commission-charge.service";

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class CommissionChargeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CommissionChargeScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly charges: CommissionChargeService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("hour"), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const n = await this.charges.runAutoConfirmPending();
      if (n > 0) {
        this.log.log(`Kiorex commission auto-confirm (${label}): confirmed ${n} charge(s)`);
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}