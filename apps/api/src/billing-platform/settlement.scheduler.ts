import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { notifyOnCall } from "../observability/notify-on-call";
import { SettlementService } from "./settlement.service";

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class SettlementScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SettlementScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly settlement: SettlementService) {}

  onModuleInit() {
    void this.tick("startup");
    this.timer = setInterval(() => void this.tick("hour"), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(label: string) {
    try {
      await this.settlement.maybeRunCairoMonthlyBatch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log.warn(`Settlement scheduler (${label}): ${message}`);
      notifyOnCall("SETTLEMENT_JOB_FAILED", { label, message });
    }
  }
}