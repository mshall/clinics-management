import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { KiorlyPaymentService } from "./kiorly-payment.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class KiorlyPaymentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(KiorlyPaymentScheduler.name);
  private dayTimer: ReturnType<typeof setInterval> | null = null;
  private hourTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly payments: KiorlyPaymentService) {}

  onModuleInit() {
    void this.runSafe("startup");
    this.dayTimer = setInterval(() => void this.runSafe("day"), DAY_MS);
    this.hourTimer = setInterval(() => void this.runAutoCharge("hour"), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.dayTimer) clearInterval(this.dayTimer);
    if (this.hourTimer) clearInterval(this.hourTimer);
  }

  private async runSafe(label: string) {
    try {
      const recon = await this.payments.runReconciliation();
      if (recon.matched > 0) {
        this.log.log(`Kiorly payment reconciliation (${label}): matched ${recon.matched}`);
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }

  private async runAutoCharge(label: string) {
    try {
      const n = await this.payments.runAutoChargeRetries();
      if (n > 0) this.log.log(`Kiorly auto-charge (${label}): ${n} invoice(s)`);
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}