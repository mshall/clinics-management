import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { NoShowGuaranteeService } from "./no-show-guarantee.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class NoShowGuaranteeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NoShowGuaranteeScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly guarantee: NoShowGuaranteeService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const result = await this.guarantee.runDailyEvaluation();
      if (result.granted > 0) {
        this.log.log(`No-show guarantee (${label}): evaluated ${result.evaluated}, granted ${result.granted}`);
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}
