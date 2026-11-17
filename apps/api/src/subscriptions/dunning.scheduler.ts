import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DunningService } from "./dunning.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DunningScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DunningScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dunning: DunningService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(label: string) {
    try {
      const { processed } = await this.dunning.runDaily();
      if (processed > 0) this.log.log(`SB-03 dunning (${label}): ${processed} tenant(s)`);
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}