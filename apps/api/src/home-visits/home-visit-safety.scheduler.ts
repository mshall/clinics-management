import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { HomeVisitSafetyService } from "./home-visit-safety.service";
import { HomeVisitPrivacyService } from "./home-visit-privacy.service";

/** Tick <= 15 s: the safety drill's 60 s delivery SLA budget assumes it (docs/FIELD_VISIT.md). */
export const SAFETY_TICK_MS = 15_000;
/** Masking runs far less often: it only has to beat the 24 h window by minutes, not seconds. */
const MASK_EVERY_TICKS = 40;

@Injectable()
export class HomeVisitSafetyScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(HomeVisitSafetyScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private n = 0;

  constructor(
    private readonly safety: HomeVisitSafetyService,
    private readonly privacy: HomeVisitPrivacyService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test" || process.env.KIORLY_DISABLE_SCHEDULERS === "1") return;
    this.timer = setInterval(() => void this.run(), SAFETY_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.safety.tick(now);
      if (this.n++ % MASK_EVERY_TICKS === 0) await this.privacy.maskExpiredAddresses(now);
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
    }
  }
}
