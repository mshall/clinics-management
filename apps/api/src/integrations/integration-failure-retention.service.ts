import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class IntegrationFailureRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(IntegrationFailureRetentionService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.purgeAllTenants();
    this.timer = setInterval(() => void this.purgeAllTenants(), PURGE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeAllTenants(): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, integrationFailureRetentionDays: true },
    });
    let total = 0;
    for (const t of tenants) {
      const days = Math.max(1, t.integrationFailureRetentionDays ?? 30);
      const deleted = await this.purgeTenant(t.id, days);
      total += deleted;
    }
    if (total > 0) {
      this.log.log(`Purged ${total} integration failure log row(s) across tenants`);
    }
    return total;
  }

  async purgeTenant(tenantId: string, retentionDays: number): Promise<number> {
    const days = Math.max(1, Math.min(3650, retentionDays));
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await this.prisma.integrationFailureLog.deleteMany({
      where: { tenantId, createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
