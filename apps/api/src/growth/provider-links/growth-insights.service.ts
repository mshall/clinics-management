import { Injectable, Optional } from "@nestjs/common";
import { AppointmentStatus, ListingStatus, ReferralLinkOwnerScope, ReferralLinkStatus } from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import { MarketplaceProviderProfileService } from "../../marketplace/marketplace-provider-profile.service";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeWeekJson } from "../../scheduling/availability-week-schema";
import { growthLimitsFor } from "./growth-plan-limits";
import { buildPerformance, type AppointmentFacts } from "./growth-metrics";
import { buildRecommendations } from "./growth-recommendations";
import { utcDay } from "./link-counters";
import { ProviderLinksService } from "./provider-links.service";

/** Acquisition performance, commission statement view and recommendations for the Growth workspace. Aggregates only; patient identifiers never leave the database. */
@Injectable()
export class GrowthInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProviderLinksService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly profiles?: MarketplaceProviderProfileService,
  ) {}

  async performance(user: JwtUser, q: { clinicId?: string; days?: number } = {}) {
    const tenantId = this.links.assert(user, "view");
    const plan = (await this.entitlements.resolve(tenantId)).plan.key;
    const maxDays = growthLimitsFor(plan).trendDays;
    const days = Math.min(maxDays, Math.max(7, Math.round(q.days ?? 90)));
    const since = utcDay(new Date(Date.now() - (days - 1) * 86_400_000));
    const clinicWhere = q.clinicId ? { clinicId: q.clinicId } : {};
    const [appts, daily, charges, decisions] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { tenantId, ...clinicWhere, createdAt: { gte: since }, bookingSource: { in: ["CLINIC_LINK", "KIOREX_MARKETPLACE", "KIOREX_WHATSAPP", "INTEGRATION"] } },
        select: { status: true, bookingSource: true, acquisitionOrigin: true, isNewPatientAtBooking: true, feeAmount: true, createdAt: true, checkedInAt: true },
        take: 20000,
      }),
      this.prisma.providerReferralLinkDaily.aggregate({ where: { tenantId, date: { gte: since }, ...(q.clinicId ? { link: { clinicId: q.clinicId } } : {}) }, _sum: { visits: true, bookings: true, attended: true } }),
      this.prisma.kiorexCommissionCharge.findMany({
        where: { tenantId, ...clinicWhere, attendedAt: { gte: since }, status: { in: ["PENDING", "CONFIRMED", "BILLED", "DISPUTED"] } },
        select: { amount: true, currency: true, status: true, attendedAt: true },
      }),
      this.prisma.kiorexCommissionDecision.groupBy({ by: ["decision"], where: { tenantId, ...clinicWhere, createdAt: { gte: since } }, _count: { _all: true } }),
    ]);
    const facts: AppointmentFacts[] = appts.map((a) => ({ ...a, feeAmount: Number(a.feeAmount) }));
    const perf = buildPerformance(facts, { visits: daily._sum.visits ?? 0, bookings: daily._sum.bookings ?? 0, attended: daily._sum.attended ?? 0 });
    const byMonth = new Map<string, { month: string; amount: number; charges: number }>();
    let currency = "EGP";
    for (const c of charges) {
      currency = c.currency || currency;
      const month = c.attendedAt.toISOString().slice(0, 7);
      const m = byMonth.get(month) ?? { month, amount: 0, charges: 0 };
      m.amount = Math.round((m.amount + Number(c.amount)) * 100) / 100;
      m.charges += 1;
      byMonth.set(month, m);
    }
    const commissionTotal = Math.round([...byMonth.values()].reduce((s, m) => s + m.amount, 0) * 100) / 100;
    return {
      days,
      ...perf,
      commission: {
        currency,
        total: commissionTotal,
        byMonth: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
        decisions: Object.fromEntries(decisions.map((d) => [d.decision, d._count._all])),
        incrementalRevenueNet: Math.round((perf.incrementalMarketplaceRevenue - commissionTotal) * 100) / 100,
      },
      promise: "Bookings through your links never carry a Kiorex fee. A fee can only apply to a new patient who found you on Kiorex.",
    };
  }

  async recommendations(user: JwtUser, q: { clinicId?: string } = {}) {
    const tenantId = this.links.assert(user, "view");
    const access = await this.links.access(user);
    const clinicWhere = q.clinicId ? { clinicId: q.clinicId } : {};
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [listings, bookableTypes, templates, linkRows, widget, kiorex, overdue, clinic] = await Promise.all([
      this.prisma.marketplaceListing.findMany({ where: { tenantId, ...clinicWhere, status: ListingStatus.LIVE }, select: { id: true, clinicId: true, clinicianId: true, profileJson: true, tenantId: true } }),
      this.prisma.appointmentType.count({ where: { tenantId, ...(q.clinicId ? { clinicId: q.clinicId } : {}), isActive: true, marketplaceBookable: true } }),
      this.prisma.clinicianAvailabilityTemplate.findMany({ where: { tenantId, ...clinicWhere }, select: { clinicianId: true, weekJson: true } }),
      this.prisma.providerReferralLink.findMany({ where: { tenantId, ...clinicWhere, status: ReferralLinkStatus.ACTIVE }, select: { ownerScope: true } }),
      q.clinicId ? this.prisma.bookingWidgetConfig.findUnique({ where: { clinicId: q.clinicId }, select: { enabled: true } }) : this.prisma.bookingWidgetConfig.findFirst({ where: { tenantId, enabled: true }, select: { enabled: true } }),
      this.prisma.appointment.groupBy({ by: ["status"], where: { tenantId, ...clinicWhere, createdAt: { gte: since }, bookingSource: { in: ["KIOREX_MARKETPLACE", "KIOREX_WHATSAPP"] } }, _count: { _all: true } }),
      this.prisma.appointment.count({ where: { tenantId, ...clinicWhere, status: AppointmentStatus.SCHEDULED, marketplaceConfirmationDueAt: { lt: new Date() }, bookingSource: { in: ["KIOREX_MARKETPLACE", "KIOREX_WHATSAPP"] } } }),
      q.clinicId ? this.prisma.clinic.findFirst({ where: { id: q.clinicId, tenantId }, select: { bookingSlug: true } }) : null,
    ]);
    const hasAvailability = new Set(templates.filter((t) => hasAnyHours(t.weekJson)).map((t) => t.clinicianId));
    const doctorsWithout = listings.filter((l) => !hasAvailability.has(l.clinicianId)).length;
    let completeness: number | null = null;
    if (this.profiles && listings.length) {
      const vals = await Promise.all(listings.map((l) => this.profiles!.completenessForListing(l)));
      completeness = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    const n = (s: AppointmentStatus) => kiorex.find((k) => k.status === s)?._count._all ?? 0;
    const total = kiorex.reduce((s, k) => s + k._count._all, 0);
    const recs = buildRecommendations({
      activeLinks: linkRows.length,
      hasDeskLink: linkRows.some((l) => l.ownerScope === ReferralLinkOwnerScope.DESK),
      widgetEnabled: Boolean(widget?.enabled),
      widgetEntitled: access.plan.widget,
      pageReady: clinic ? Boolean(clinic.bookingSlug) && listings.length > 0 && bookableTypes > 0 : listings.length > 0 && bookableTypes > 0,
      liveDoctors: listings.length,
      doctorsWithoutAvailability: doctorsWithout,
      bookableTypes,
      avgProfileCompleteness: completeness,
      kiorexBookings30d: total,
      cancelled30d: n(AppointmentStatus.CANCELLED),
      noShow30d: n(AppointmentStatus.NO_SHOW),
      overdueConfirmations: overdue,
    });
    return { items: recs, guardrail: "Recommendations never suggest extra procedures, patient-facing price pressure or testimonial tactics. Only verified Kiorex reviews are shown." };
  }
}

/** A weekly template counts when any day lists at least one slot. */
function hasAnyHours(week: unknown): boolean {
  return normalizeWeekJson(week).days.some((d) => d.slots.length > 0);
}
