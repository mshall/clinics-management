import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClinicAiService } from "./clinic-ai.service";

const DAY_MS = 86_400_000;
/** 01:00 UTC — overnight for the launch markets. */
const RUN_AT_UTC_HOUR = 1;

export function msUntilNextNightlyRun(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(RUN_AT_UTC_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS);
  return next.getTime() - now.getTime();
}

/** FS-05: nightly refresh of the stored rule-based no-show score for Pro+ tenants. */
@Injectable()
export class NoShowRiskScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NoShowRiskScheduler.name);
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly clinicAi: ClinicAiService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timeout = setTimeout(() => {
      void this.runSafely();
      this.interval = setInterval(() => void this.runSafely(), DAY_MS);
    }, msUntilNextNightlyRun(new Date()));
  }

  onModuleDestroy() {
    if (this.timeout) clearTimeout(this.timeout);
    if (this.interval) clearInterval(this.interval);
  }

  private async runSafely() {
    try {
      const r = await this.runNightly();
      this.log.log(`no-show risk refreshed: ${r.tenants} tenants, ${r.updated} appointments`);
    } catch (e) {
      this.log.warn(`no-show risk refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async runNightly(now: Date = new Date()): Promise<{ tenants: number; updated: number }> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let refreshed = 0;
    let updated = 0;
    for (const t of tenants) {
      if (!(await this.entitlements.isEntitled(t.id, "mod_front_desk"))) continue;
      const r = await this.clinicAi.refreshAppointmentNoShowRisks(t.id, undefined, now);
      refreshed += 1;
      updated += r.updated;
    }
    return { tenants: refreshed, updated };
  }
}
