import { Injectable } from "@nestjs/common";
import { MarketLaunchStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { parseInsightsRange } from "../common/insights-range";
import { effectiveOperationalStatus, marketOperabilityLabel } from "../markets/market-operational";
import { PrismaService } from "../prisma/prisma.service";
import { BadRequestException } from "@nestjs/common";

@Injectable()
export class PlatformInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new BadRequestException("Platform super admin only");
  }

  async organizationDirectory(user: JwtUser, fromStr?: string, toStr?: string) {
    this.assertPlatform(user);
    const { from, to } = parseInsightsRange(fromStr, toStr);
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { name: "asc" },
      include: {
        market: { select: { code: true, nameEn: true, operationalStatus: true, status: true, pausedUntil: true } },
        _count: {
          select: { users: true, clinics: true, patients: true, encounters: true, appointments: true },
        },
      },
    });

    const activity = await this.prisma.auditLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const auditByTenant = new Map(
      activity.filter((a) => a.tenantId).map((a) => [a.tenantId, a._count?._all ?? 0]),
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      organizations: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        nameAr: t.nameAr,
        baseCurrency: t.baseCurrency,
        marketCode: t.market?.code ?? null,
        marketNameEn: t.market?.nameEn ?? null,
        marketOperability: t.market
          ? marketOperabilityLabel({
              status: t.market.status,
              operationalStatus: t.market.operationalStatus,
              pausedUntil: t.market.pausedUntil,
            })
          : null,
        counts: t._count,
        auditEventsInPeriod: auditByTenant.get(t.id) ?? 0,
        deploymentCell: t.deploymentCell,
      })),
    };
  }

  async platformOverview(user: JwtUser, fromStr?: string, toStr?: string) {
    this.assertPlatform(user);
    const { from, to } = parseInsightsRange(fromStr, toStr);

    const [tenantCount, userCount, clinicCount, patientCount, encounterCount, markets, auditTotal, topTenants, tenantsPerMarket] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.user.count({ where: { tenantId: { not: null } } }),
        this.prisma.clinic.count(),
        this.prisma.patient.count(),
        this.prisma.encounter.count({ where: { createdAt: { gte: from, lte: to } } }),
        this.prisma.market.findMany({ orderBy: { code: "asc" } }),
        this.prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to } } }),
        this.prisma.auditLog.groupBy({
          by: ["tenantId"],
          where: { createdAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
        this.prisma.tenant.groupBy({
          by: ["marketId"],
          _count: { _all: true },
        }),
      ]);

    const topSorted = [...topTenants]
      .filter((row) => row.tenantId)
      .sort((a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0))
      .slice(0, 10);
    const tenantNames = await this.prisma.tenant.findMany({
      where: { id: { in: topSorted.map((t) => t.tenantId!).filter(Boolean) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(tenantNames.map((t) => [t.id, t.name]));
    const orgsByMarket = new Map(
      tenantsPerMarket.map((row) => [row.marketId ?? "none", row._count?._all ?? 0]),
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        organizations: tenantCount,
        users: userCount,
        clinics: clinicCount,
        patients: patientCount,
        encountersInPeriod: encounterCount,
        auditEventsInPeriod: auditTotal,
      },
      markets: markets.map((m) => ({
        id: m.id,
        code: m.code,
        nameEn: m.nameEn,
        launchStatus: m.status,
        operationalStatus: effectiveOperationalStatus(m),
        operability: marketOperabilityLabel(m),
        dataRegion: m.dataRegion,
        hostCell: m.hostCell,
        pausedUntil: m.pausedUntil?.toISOString() ?? null,
        launchedAt: m.launchedAt?.toISOString() ?? null,
        tenantCount: orgsByMarket.get(m.id) ?? 0,
      })),
      topOrganizationsByActivity: topSorted.map((row) => ({
          tenantId: row.tenantId,
          name: row.tenantId ? nameById.get(row.tenantId) ?? row.tenantId : "—",
          auditEvents: row._count?._all ?? 0,
        })),
      liveMarkets: markets.filter((m) => m.status === MarketLaunchStatus.LIVE).length,
    };
  }
}