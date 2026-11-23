import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { TelehealthNotifier } from "./telehealth-notifier.service";
import { TelehealthService } from "./telehealth.service";

export const TELEHEALTH_TICK_MS = 30_000;

/** In-process tick (skipped under NODE_ENV=test or KIORLY_DISABLE_SCHEDULERS=1). Multi-instance safe: transitions are guarded updateMany calls. */
@Injectable()
export class TelehealthScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelehealthScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly svc: TelehealthService, private readonly notifier: TelehealthNotifier) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test" || process.env.KIORLY_DISABLE_SCHEDULERS === "1") return;
    this.timer = setInterval(() => void this.run(), TELEHEALTH_TICK_MS);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.svc.tick(now);
      await this.notifier.sendDueReminders(now);
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
    }
  }
}
