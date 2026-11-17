import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EtaHealthService } from "./eta-health.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EtaHealthScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EtaHealthScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: EtaHealthService,
  ) {}

  onModuleInit() {
    if (process.env.ETA_HEALTH_SCHEDULER === "false") return;
    void this.runSafe("boot");
    this.timer = setInterval(() => void this.runSafe("interval"), DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafe(reason: string): Promise<void> {
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: {
          market: { code: "EG" },
          etaPilotProductionStartedAt: { not: null },
        },
        select: { id: true },
        take: 200,
      });
      for (const t of tenants) {
        await this.health.maybeAlertDailyForTenant(t.id);
      }
    } catch (e) {
      this.log.warn(`ETA health scheduler ${reason}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}