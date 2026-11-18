import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PriceIndexationService } from "./price-indexation.service";

const HOUR_MS = 60 * 60 * 1000;

/** SB-06: hourly — send due price-change notices, apply migrations at renewal. */
@Injectable()
export class PriceIndexationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PriceIndexationScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly indexation: PriceIndexationService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      await this.indexation.runDue();
    } catch (e) {
      this.log.warn(`Price indexation job: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
