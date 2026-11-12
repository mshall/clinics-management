import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const SPIKE_WINDOW_MS = 60 * 60 * 1000;
const SPIKE_THRESHOLD = 8;
const SPIKE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IntegrationFailureGovernanceService {
  private readonly log = new Logger(IntegrationFailureGovernanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async maybeAlertSpike(tenantId: string): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { integrationFailureLastSpikeAlertAt: true },
      });
      if (!tenant) return;

      const since = new Date(Date.now() - SPIKE_WINDOW_MS);
      const recentCount = await this.prisma.integrationFailureLog.count({
        where: { tenantId, createdAt: { gte: since }, statusCode: { gte: 400 } },
      });
      if (recentCount < SPIKE_THRESHOLD) return;

      const last = tenant.integrationFailureLastSpikeAlertAt;
      if (last && Date.now() - last.getTime() < SPIKE_COOLDOWN_MS) return;

      await this.prisma.$transaction([
        this.prisma.tenant.update({
          where: { id: tenantId },
          data: { integrationFailureLastSpikeAlertAt: new Date() },
        }),
        this.prisma.auditLog.create({
          data: {
            tenantId,
            actorId: null,
            clinicId: null,
            action: "INTEGRATION_FAILURE_SPIKE",
            resource: "IntegrationFailureLog",
            resourceId: null,
            metadata: {
              failuresLastHour: recentCount,
              threshold: SPIKE_THRESHOLD,
              message: "Elevated integration failure rate detected",
            },
          },
        }),
      ]);
      this.log.warn(`Integration failure spike for tenant ${tenantId}: ${recentCount} in last hour`);
    } catch (err) {
      this.log.warn(`Spike check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
