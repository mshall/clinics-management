import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexProgressService } from "../billing-platform/kiorex-progress.service";
import { parseBillingPeriod } from "../billing-platform/settlement-period";
import { PrismaService } from "../prisma/prisma.service";
import { currentPeriodKey, KIOREX_OVERVIEW_SOURCES, summarizeKiorexOverview } from "./kiorex-overview";
import { weightedKiorexRating } from "./kiorex-rating";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

export type ProfileViewsBody = {
  clinicId: string;
  items: { clinicianId: string; date: string; views: number }[];
};

const MAX_VIEW_ITEMS = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class KiorexOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MarketplaceAccessService,
    private readonly listings: MarketplaceListingService,
    private readonly progress: KiorexProgressService,
  ) {}

  /** Kiorex pushes daily profile views per doctor; re-sending a day replaces its count. */
  async syncProfileViews(_client: PlatformIntegrationPrincipal, body: ProfileViewsBody) {
    if (!body?.clinicId || !Array.isArray(body.items)) throw new BadRequestException("clinicId and items are required");
    if (body.items.length > MAX_VIEW_ITEMS) throw new BadRequestException(`At most ${MAX_VIEW_ITEMS} items per request`);
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId);
    const listed = new Set(
      (
        await this.prisma.marketplaceListing.findMany({ where: { clinicId: body.clinicId }, select: { clinicianId: true } })
      ).map((l) => l.clinicianId),
    );
    let accepted = 0;
    const rejected: { clinicianId: string; date: string; code: string }[] = [];
    for (const item of body.items) {
      const views = Number(item.views);
      if (!listed.has(item.clinicianId) || !DAY_RE.test(item.date ?? "") || !Number.isInteger(views) || views < 0) {
        rejected.push({ clinicianId: item.clinicianId, date: item.date, code: "INVALID" });
        continue;
      }
      const day = new Date(`${item.date}T00:00:00.000Z`);
      await this.prisma.kiorexProfileViewDaily.upsert({
        where: { clinicId_clinicianId_day: { clinicId: body.clinicId, clinicianId: item.clinicianId, day } },
        create: { tenantId, clinicId: body.clinicId, clinicianId: item.clinicianId, day, views },
        update: { views },
      });
      accepted += 1;
    }
    return { accepted, rejected };
  }

  /**
   * Performance for one branch, or the whole organization when `clinicId` is omitted / `all`.
   * Branch managers and clinic/group admins may request either scope (same manage gate as KX-10).
   */
  async overview(user: JwtUser, clinicId: string | undefined, periodRaw?: string) {
    if (!user.tenantId) throw new BadRequestException("Tenant context required");
    this.listings.assertClinicManage(user, user.tenantId);

    const raw = clinicId?.trim() ?? "";
    const orgWide = !raw || raw.toLowerCase() === "all";

    let clinic: { id: string; tenantId: string; defaultCurrency: string } | null = null;
    if (!orgWide) {
      clinic = await this.prisma.clinic.findFirst({
        where: { id: raw, tenantId: user.tenantId },
        select: { id: true, tenantId: true, defaultCurrency: true },
      });
      if (!clinic) throw new NotFoundException("Clinic not found");
    }

    const tenantId = clinic?.tenantId ?? user.tenantId;
    const clinicScope = clinic ? { clinicId: clinic.id } : {};

    let period;
    try {
      period = parseBillingPeriod(periodRaw?.trim() || currentPeriodKey());
    } catch {
      throw new BadRequestException("period must be YYYY-MM");
    }
    const range = { gte: period.periodStart, lt: period.periodEnd };

    const [appointments, charges, views, ratings, tenant] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          ...clinicScope,
          bookingSource: { in: [...KIOREX_OVERVIEW_SOURCES] },
          startsAt: range,
          patient: { isSample: false },
        },
        select: { startsAt: true, status: true, bookingSource: true, isNewPatientAtBooking: true },
      }),
      this.prisma.kiorexCommissionCharge.findMany({
        where: { tenantId, ...clinicScope, attendedAt: range },
        select: { amount: true, status: true, attendedAt: true, currency: true },
      }),
      this.prisma.kiorexProfileViewDaily.findMany({
        where: { tenantId, ...clinicScope, day: range },
        select: { day: true, views: true },
      }),
      this.prisma.kiorexRating.findMany({
        where: { tenantId, ...clinicScope },
        select: { averageRating: true, reviewCount: true },
      }),
      orgWide
        ? this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrency: true } })
        : Promise.resolve(null),
    ]);

    const figures = summarizeKiorexOverview(period.periodStart, period.periodEnd, appointments, charges, views);

    let freeProgress: Awaited<ReturnType<KiorexProgressService["getProgress"]>> | null = null;
    try {
      freeProgress = await this.progress.getProgress(user, period.periodKey);
    } catch {
      freeProgress = null;
    }

    return {
      clinicId: clinic?.id ?? null,
      scope: clinic ? ("clinic" as const) : ("organization" as const),
      periodKey: period.periodKey,
      currency: charges[0]?.currency ?? clinic?.defaultCurrency ?? tenant?.baseCurrency ?? "EGP",
      ...figures,
      rating: weightedKiorexRating(ratings),
      /** Tenant-wide (all branches): Kiorex commission offset against the Kiorly subscription (CR-07). */
      creditOffset: freeProgress ? freeProgress.offsetAmount : null,
      freeProgress: freeProgress
        ? {
            progressPercent: freeProgress.progressPercent,
            patientsAttended: freeProgress.patientsAttended,
            patientsTarget: freeProgress.patientsTarget,
            patientsStillNeeded: freeProgress.patientsStillNeeded,
            isFreeThisMonth: freeProgress.isFreeThisMonth,
            subscriptionAmount: freeProgress.subscriptionAmount,
            currency: freeProgress.currency,
          }
        : null,
    };
  }
}
