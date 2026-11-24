import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { AppointmentStatus, ListingStatus, ProviderRecommendationStatus, ReferralLinkOwnerScope, ReferralLinkStatus } from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import { MarketplaceProviderProfileService } from "../../marketplace/marketplace-provider-profile.service";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeWeekJson } from "../../scheduling/availability-week-schema";
import { growthLimitsFor } from "./growth-plan-limits";
import { buildPerformance, type AppointmentFacts } from "./growth-metrics";
import { buildRecommendations, RECOMMENDATION_IDS, THRESHOLDS_V2 } from "./growth-recommendations";
import { parseProviderProfileJson } from "../../marketplace/provider-profile-schema";
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
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [listings, bookableTypes, templates, linkRows, widget, kiorex, overdue, clinic, extra] = await Promise.all([
      this.prisma.marketplaceListing.findMany({ where: { tenantId, ...clinicWhere, status: ListingStatus.LIVE }, select: { id: true, clinicId: true, clinicianId: true, profileJson: true, tenantId: true } }),
      this.prisma.appointmentType.count({ where: { tenantId, ...(q.clinicId ? { clinicId: q.clinicId } : {}), isActive: true, marketplaceBookable: true } }),
      this.prisma.clinicianAvailabilityTemplate.findMany({ where: { tenantId, ...clinicWhere }, select: { clinicianId: true, weekJson: true } }),
      this.prisma.providerReferralLink.findMany({ where: { tenantId, ...clinicWhere, status: ReferralLinkStatus.ACTIVE }, select: { ownerScope: true } }),
      q.clinicId ? this.prisma.bookingWidgetConfig.findUnique({ where: { clinicId: q.clinicId }, select: { enabled: true } }) : this.prisma.bookingWidgetConfig.findFirst({ where: { tenantId, enabled: true }, select: { enabled: true } }),
      this.prisma.appointment.groupBy({ by: ["status"], where: { tenantId, ...clinicWhere, createdAt: { gte: since }, bookingSource: { in: ["KIOREX_MARKETPLACE", "KIOREX_WHATSAPP"] } }, _count: { _all: true } }),
      this.prisma.appointment.count({ where: { tenantId, ...clinicWhere, status: AppointmentStatus.SCHEDULED, marketplaceConfirmationDueAt: { lt: new Date() }, bookingSource: { in: ["KIOREX_MARKETPLACE", "KIOREX_WHATSAPP"] } } }),
      q.clinicId ? this.prisma.clinic.findFirst({ where: { id: q.clinicId, tenantId }, select: { bookingSlug: true } }) : null,
      this.v2Facts(tenantId, q.clinicId, since, now, access.plan),
    ]);
    const hasAvailability = new Set(templates.filter((t) => hasAnyHours(t.weekJson)).map((t) => t.clinicianId));
    const weeklySlots = new Map<string, number>();
    for (const t of templates) weeklySlots.set(t.clinicianId, (weeklySlots.get(t.clinicianId) ?? 0) + normalizeWeekJson(t.weekJson).days.reduce((n, d) => n + d.slots.length, 0));
    const doctorsWithout = listings.filter((l) => !hasAvailability.has(l.clinicianId)).length;
    let completeness: number | null = null;
    if (this.profiles && listings.length) {
      const vals = await Promise.all(listings.map((l) => this.profiles!.completenessForListing(l)));
      completeness = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    const profiles = listings.map((l) => parseProviderProfileJson(l.profileJson));
    const n = (s: AppointmentStatus) => kiorex.find((k) => k.status === s)?._count._all ?? 0;
    const total = kiorex.reduce((s, k) => s + k._count._all, 0);
    const all = buildRecommendations({
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
      doctorsWithoutPhoto: profiles.filter((p) => !p.photoRelativePath?.trim()).length,
      doctorsWithIncompleteBio: profiles.filter((p) => (p.bioEn?.trim().length ?? 0) < 40 || (p.bioAr?.trim().length ?? 0) < 40).length,
      doctorsWithFewSlots: listings.filter((l) => hasAvailability.has(l.clinicianId) && (weeklySlots.get(l.clinicianId) ?? 0) < THRESHOLDS_V2.fewSlotsPerWeek).length,
      doctorsSingleLanguage: profiles.filter((p) => (p.languages?.length ?? 0) < 2).length,
      ...extra,
    });
    const states = await this.prisma.providerRecommendationState.findMany({ where: { tenantId, clinicId: q.clinicId ?? "" } });
    const stateBy = new Map(states.map((s) => [s.key, s]));
    const items = all
      .map((r) => ({ ...r, state: effectiveState(stateBy.get(r.id), now) }))
      .filter((r) => r.state.status === "OPEN");
    const hidden = all.length - items.length;
    return { items, hidden, catalogue: RECOMMENDATION_IDS.length, guardrail: "Recommendations never suggest extra procedures, patient-facing price pressure or testimonial tactics. Only verified Kiorex reviews are shown. Each card shows the data window it looked at and never promises a result." };
  }

  /** Dismiss, snooze (1 to 90 days), mark done or reopen one recommendation of one clinic. Persisted per clinic; the rule can still reappear after a snooze ends. */
  async setRecommendationState(user: JwtUser, id: string, body: { clinicId?: string; status?: string; snoozeDays?: number }) {
    const tenantId = this.links.assert(user, "update");
    if (!(RECOMMENDATION_IDS as readonly string[]).includes(id)) throw new BadRequestException({ code: "RECOMMENDATION_UNKNOWN", message: "Unknown recommendation" });
    const status = String(body.status ?? "").toUpperCase();
    if (!(["DISMISSED", "SNOOZED", "DONE", "OPEN"] as const).includes(status as never)) throw new BadRequestException({ code: "RECOMMENDATION_STATE_INVALID", message: "status must be DISMISSED, SNOOZED, DONE or OPEN" });
    const clinic = await this.prisma.clinic.findFirst({ where: { id: body.clinicId ?? "", tenantId }, select: { id: true } });
    if (!clinic) throw new BadRequestException({ code: "RECOMMENDATION_STATE_INVALID", message: "clinicId is required" });
    let until: Date | null = null;
    if (status === "SNOOZED") {
      const days = Math.round(Number(body.snoozeDays ?? 7));
      if (!Number.isFinite(days) || days < 1 || days > 90) throw new BadRequestException({ code: "RECOMMENDATION_STATE_INVALID", message: "snoozeDays must be 1 to 90" });
      until = new Date(Date.now() + days * 86_400_000);
    }
    const row = await this.prisma.providerRecommendationState.upsert({
      where: { clinicId_key: { clinicId: clinic.id, key: id } },
      update: { status: status as ProviderRecommendationStatus, until, updatedBy: user.userId },
      create: { tenantId, clinicId: clinic.id, key: id, status: status as ProviderRecommendationStatus, until, updatedBy: user.userId },
    });
    return { id: row.key, status: row.status, until: row.until?.toISOString() ?? null };
  }

  /** Facts for the GRW-P2-C rules. Counts only. */
  private async v2Facts(tenantId: string, clinicId: string | undefined, since: Date, now: Date, plan: { maxActiveLinks: number; linksUsed: number }) {
    const clinicWhere = clinicId ? { clinicId } : {};
    const idleBefore = new Date(now.getTime() - THRESHOLDS_V2.pausedIdleDays * 86_400_000);
    const closing = new Date(now.getTime() + THRESHOLDS_V2.disputeClosingDays * 86_400_000);
    const [unreplied, verification, daily, idle, shared, disputes] = await Promise.all([
      this.prisma.kiorexReview.count({ where: { tenantId, ...clinicWhere, moderationStatus: "VISIBLE", reviewedAt: { gte: since }, replyText: null } }),
      this.prisma.providerVerificationUpdateRequest.count({ where: { tenantId, ...clinicWhere, status: { in: ["SUBMITTED", "NEEDS_INFO"] } } }),
      this.prisma.providerReferralLinkDaily.aggregate({ where: { tenantId, date: { gte: utcDay(since) }, ...(clinicId ? { link: { clinicId } } : {}) }, _sum: { visits: true, bookings: true } }),
      this.prisma.providerReferralLink.count({ where: { tenantId, ...clinicWhere, status: ReferralLinkStatus.PAUSED, updatedAt: { lt: idleBefore } } }),
      this.prisma.socialShareLog.count({ where: { tenantId, ...clinicWhere, createdAt: { gte: since } } }),
      this.prisma.kiorexCommissionCharge.count({ where: { tenantId, ...clinicWhere, status: { in: ["PENDING", "CONFIRMED"] }, commissionDispute: null, disputeDeadline: { gt: now, lte: closing } } }),
    ]);
    return {
      unrepliedReviews30d: unreplied,
      verificationRequestsPending: verification,
      linkVisits30d: daily._sum.visits ?? 0,
      linkBookings30d: daily._sum.bookings ?? 0,
      pausedIdleLinks: idle,
      socialSharedLast30d: shared,
      disputesClosingSoon: disputes,
      linksUsed: plan.linksUsed,
      maxActiveLinks: plan.maxActiveLinks,
    };
  }
}

type RecState = { status: ProviderRecommendationStatus; until: Date | null } | undefined;
/** DISMISSED and DONE hide the card; SNOOZED hides it until `until`. Pure (tested). */
export function effectiveState(row: RecState, now: Date): { status: "OPEN" | "DISMISSED" | "SNOOZED" | "DONE"; until: string | null } {
  if (!row || row.status === "OPEN") return { status: "OPEN", until: null };
  if (row.status === "SNOOZED") return row.until && row.until.getTime() > now.getTime() ? { status: "SNOOZED", until: row.until.toISOString() } : { status: "OPEN", until: null };
  return { status: row.status, until: null };
}

/** A weekly template counts when any day lists at least one slot. */
function hasAnyHours(week: unknown): boolean {
  return normalizeWeekJson(week).days.some((d) => d.slots.length > 0);
}
