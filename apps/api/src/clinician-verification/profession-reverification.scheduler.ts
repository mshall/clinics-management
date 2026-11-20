import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ProfessionReverificationService } from "./profession-reverification.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProfessionReverificationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ProfessionReverificationScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly svc: ProfessionReverificationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    void this.runSafe();
    this.timer = setInterval(() => void this.runSafe(), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe() {
    try {
      await this.svc.runDaily();
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}
