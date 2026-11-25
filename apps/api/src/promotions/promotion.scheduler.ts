import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PromotionBudgetService } from "./promotion-budget.service";
import { PromotionCompletionConsumer } from "./promotion-completion.consumer";
import { PromotionReconcileService } from "./promotion-reconcile.service";
import { PromotionService } from "./promotion.service";

/** One-minute tick: activation and expiry, reservation expiry, attendance and cancel settlement; daily reconciliation. Safe on several instances (every step is idempotent and locks the promotion row). */
@Injectable()
export class PromotionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PromotionScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null; private lastReconcileDay = "";
  constructor(private readonly promos: PromotionService, private readonly budget: PromotionBudgetService, private readonly consumer: PromotionCompletionConsumer, private readonly reconcile: PromotionReconcileService) {}
  onModuleInit() { if (process.env.NODE_ENV === "test" || process.env.PROMOTION_SCHEDULER === "off") return; this.timer = setInterval(() => void this.tick().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e))), 60_000); this.timer.unref?.(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick(now = new Date()) {
    const lifecycle = await this.promos.tick(now); const expired = await this.budget.sweepExpired(now); const attendance = await this.consumer.runOnce(now);
    const day = now.toISOString().slice(0, 10); let reconcile: Awaited<ReturnType<PromotionReconcileService["run"]>> | null = null;
    if (day !== this.lastReconcileDay && now.getUTCHours() >= 1) { this.lastReconcileDay = day; reconcile = await this.reconcile.run(); if (reconcile.findings.length) this.log.error(`promotion reconciliation: ${JSON.stringify(reconcile.findings.slice(0, 20))}`); }
    return { lifecycle, expired, attendance, reconcile };
  }
}
