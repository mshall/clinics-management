import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { notifyOnCall } from "./notify-on-call";
import { shouldAlertSignupFunnelDrop, type SignupFunnelCounts } from "./signup-funnel-health";
import { whatsappFailureSpike, WHATSAPP_FAILURE_SPIKE_WINDOW_MS } from "./whatsapp-delivery-health";

const HOUR_MS = 60 * 60 * 1000;
const SIGNUP_WINDOW_MS = 24 * HOUR_MS;
const PLATFORM_ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;

@Injectable()
export class ObservabilityHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ObservabilityHealthService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSignupAlertAt = 0;
  private lastWhatsappAlertAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.DISABLE_OBSERVABILITY_SCHEDULER === "true") return;
    void this.tick("startup");
    this.timer = setInterval(() => void this.tick("hour"), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(label: string) {
    try {
      await this.checkSignupFunnel();
      await this.checkWhatsappDeliverySpike();
    } catch (e) {
      this.log.warn(`Observability tick (${label}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async checkSignupFunnel(): Promise<void> {
    const since = new Date(Date.now() - SIGNUP_WINDOW_MS);
    const [otpVerified, signupsCompleted] = await Promise.all([
      this.prisma.otpChallenge.count({
        where: { purpose: "SIGNUP", consumedAt: { not: null, gte: since } },
      }),
      this.prisma.auditLog.count({
        where: { action: "SIGNUP_COMPLETED", createdAt: { gte: since } },
      }),
    ]);
    const counts: SignupFunnelCounts = { otpVerified, signupsCompleted };
    if (!shouldAlertSignupFunnelDrop(counts)) return;
    if (Date.now() - this.lastSignupAlertAt < PLATFORM_ALERT_COOLDOWN_MS) return;
    this.lastSignupAlertAt = Date.now();

    notifyOnCall("SIGNUP_FUNNEL_DROP", { ...counts, windowHours: 24 });
  }

  async checkWhatsappDeliverySpike(): Promise<void> {
    const since = new Date(Date.now() - WHATSAPP_FAILURE_SPIKE_WINDOW_MS);
    const failuresLastHour = await this.prisma.auditLog.count({
      where: { action: "WHATSAPP_DELIVERY_FAILED", createdAt: { gte: since } },
    });
    if (!whatsappFailureSpike(failuresLastHour)) return;
    if (Date.now() - this.lastWhatsappAlertAt < PLATFORM_ALERT_COOLDOWN_MS) return;
    this.lastWhatsappAlertAt = Date.now();

    notifyOnCall("WHATSAPP_DELIVERY_FAILURE_SPIKE", { failuresLastHour });
  }
}