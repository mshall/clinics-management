import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicRecordStatus, ListingStatus, ReferralLinkOwnerScope, ReferralLinkStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { effectiveRoles } from "../common/effective-roles";
import { growthLevel } from "../growth/provider-links/growth-access";
import { GrowthInsightsService } from "../growth/provider-links/growth-insights.service";
import { kiorexCanonicalUrl, shortUrl, trackedPageUrl } from "../growth/provider-links/link-urls";
import { qrSvg } from "../growth/provider-links/qr-svg";
import { ProviderLinksService, type CreateLinkBody, type UpdateLinkBody } from "../growth/provider-links/provider-links.service";
import { CommissionDecisionsService } from "../kiorex/commission-decisions.service";
import { PrismaService } from "../prisma/prisma.service";
import { modulesFor } from "./mobile-roles";

/** GRW-P1-L: the Growth tab of the Kiorly staff app. Reuses the D1/D2 services; never exposes patient data (counts, link codes and money only). */
export type MobileGrowthLevel = "admin" | "marketing" | "read" | "doctor";

const MONTH = () => new Date().toISOString().slice(0, 7);
const webGrowthUrl = () => `${(process.env.APP_WEB_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "")}/kiorex/growth`;

@Injectable()
export class GrowthMobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProviderLinksService,
    private readonly insights: GrowthInsightsService,
    private readonly decisions: CommissionDecisionsService,
  ) {}

  /** Module scoping (403 MODULE_NOT_ALLOWED) + mobile level. A physician without a Growth role is a "doctor": sees only their own link and profile. */
  async level(u: JwtUser): Promise<MobileGrowthLevel> {
    const tenantId = requireTenantId(u);
    const [tn, me] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { edition: true } }),
      this.prisma.user.findUnique({ where: { id: u.userId }, select: { profession: true } }),
    ]);
    if (!modulesFor(u, tn.edition, me?.profession).some((m) => m.key === "clinic.growth" && m.enabled)) {
      throw new ForbiddenException({ code: "MODULE_NOT_ALLOWED", key: "clinic.growth", message: "Your role does not include Growth" });
    }
    const l = growthLevel(u);
    if (l !== "none") return l;
    if (effectiveRoles(u).includes("PHYSICIAN")) return "doctor";
    throw new ForbiddenException({ code: "MODULE_NOT_ALLOWED", key: "clinic.growth", message: "Your role does not include Growth" });
  }

  private async primaryClinic(tenantId: string, clinicId?: string) {
    return this.prisma.clinic.findFirst({
      where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE, ...(clinicId ? { id: clinicId } : { parentClinicId: null }) },
      orderBy: { createdAt: "asc" },
      select: { id: true, nameEn: true, nameAr: true, bookingSlug: true, country: true },
    });
  }

  private async myLinks(u: JwtUser, level: MobileGrowthLevel, clinicId?: string) {
    const tenantId = requireTenantId(u);
    if (level === "doctor") {
      const rows = await this.prisma.providerReferralLink.findMany({ where: { tenantId, clinicianId: u.userId, ownerScope: ReferralLinkOwnerScope.DOCTOR }, orderBy: { createdAt: "desc" }, take: 20 });
      return this.links.toDtos(tenantId, rows);
    }
    return (await this.links.list(u, { clinicId })).items;
  }

  /** One round trip for the whole tab (the app caches it for offline). */
  async overview(u: JwtUser, q: { clinicId?: string } = {}) {
    const level = await this.level(u);
    const tenantId = requireTenantId(u);
    const clinic = await this.primaryClinic(tenantId, q.clinicId);
    const clinicId = clinic?.id;
    const isDoctor = level === "doctor";
    const [access, links, listing] = await Promise.all([
      isDoctor ? null : this.links.access(u),
      this.myLinks(u, level, isDoctor ? undefined : clinicId),
      isDoctor
        ? this.prisma.marketplaceListing.findFirst({ where: { tenantId, clinicianId: u.userId, status: ListingStatus.LIVE }, select: { bookingSlug: true, clinicId: true } })
        : null,
    ]);
    const kiorexUrl = isDoctor
      ? listing?.bookingSlug ? kiorexCanonicalUrl({ kind: "doctor", slug: listing.bookingSlug, country: clinic?.country }) : null
      : clinic?.bookingSlug ? kiorexCanonicalUrl({ kind: "clinic", slug: clinic.bookingSlug, country: clinic.country }) : null;
    const visible = links.filter((l) => l.status !== ReferralLinkStatus.REVOKED);
    const ids = new Set(visible.map((l) => l.id));
    const totals = { visits: 0, bookings: 0, attended: 0 };
    for (const l of visible) { totals.visits += l.last30.visits; totals.bookings += l.last30.bookings; totals.attended += l.last30.attended; }

    let performance: Awaited<ReturnType<GrowthInsightsService["performance"]>> | null = null;
    let recommendations: unknown[] = [];
    let commission: Record<string, unknown> | null = null;
    if (!isDoctor) {
      const [perf, recs, stmt] = await Promise.all([
        this.insights.performance(u, { clinicId, days: 30 }),
        this.insights.recommendations(u, { clinicId }),
        level === "admin" ? this.decisions.statement(u, { period: MONTH(), clinicId }) : null,
      ]);
      performance = perf;
      recommendations = recs.items.slice(0, 5);
      if (stmt) {
        commission = {
          period: stmt.period,
          currency: stmt.currency,
          chargesByStatus: stmt.chargesByStatus,
          providerLedBookings: stmt.providerLedBookings,
          byDecision: stmt.byDecision,
          totals: stmt.totals,
          reconciled: stmt.reconciled,
          statement: stmt.statement,
        };
      }
    }
    return {
      level,
      can: { create: level === "admin" || level === "marketing", pause: level === "admin" || level === "marketing", widget: false },
      plan: access ? { key: access.plan.key, maxActiveLinks: access.plan.maxActiveLinks, linksUsed: access.plan.linksUsed } : null,
      clinic: clinic ? { id: clinic.id, nameEn: clinic.nameEn, nameAr: clinic.nameAr } : null,
      profile: {
        kind: isDoctor ? "doctor" : "clinic",
        kiorexUrl,
        pageUrl: !isDoctor && clinic?.bookingSlug ? trackedPageUrl(clinic.bookingSlug, "").replace(/\?s=$/, "") : null,
        ready: Boolean(kiorexUrl),
      },
      links: visible.map((l) => ({ id: l.id, code: l.code, label: l.label, ownerScope: l.ownerScope, channelKind: l.channelKind, status: l.status, shortUrl: l.shortUrl, targetNameEn: l.targetNameEn, targetNameAr: l.targetNameAr, last30: l.last30 })),
      summary: { days: 30, totals, links: ids.size },
      performance,
      recommendations,
      commission,
      webGrowthUrl: webGrowthUrl(),
      promise: "Bookings through your links never carry a Kiorex fee.",
      serverTime: new Date().toISOString(),
    };
  }

  /** QR for one of my links (SVG string the app renders locally), or for the public Kiorex profile when no linkId is given. */
  async qr(u: JwtUser, q: { linkId?: string; clinicId?: string }) {
    const level = await this.level(u);
    const tenantId = requireTenantId(u);
    if (q.linkId) {
      const link = await this.prisma.providerReferralLink.findFirst({ where: { id: q.linkId, tenantId } });
      if (!link || (level === "doctor" && link.clinicianId !== u.userId)) throw new NotFoundException("Link not found");
      if (link.status === ReferralLinkStatus.REVOKED) throw new NotFoundException("Link not found");
      const url = shortUrl(link.code);
      return { url, svg: await qrSvg(url, { color: "#1e1b4b" }), linkId: link.id };
    }
    const ov = await this.overview(u, q);
    if (!ov.profile.kiorexUrl) throw new NotFoundException({ code: "PROFILE_NOT_READY", message: "Your public Kiorex profile is not live yet" });
    return { url: ov.profile.kiorexUrl, svg: await qrSvg(ov.profile.kiorexUrl, { color: "#1e1b4b" }), linkId: null };
  }

  async create(u: JwtUser, body: CreateLinkBody) {
    const level = await this.level(u);
    if (level === "doctor" || level === "read") throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Your role cannot create links" });
    return this.links.create(u, body);
  }

  async update(u: JwtUser, id: string, body: UpdateLinkBody) {
    const level = await this.level(u);
    if (level === "doctor" || level === "read") throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Your role cannot change links" });
    // The app only pauses and resumes; revoking (permanent) stays on the web workspace.
    if (body?.status === "REVOKED") throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Revoke a link on the web workspace" });
    return this.links.update(u, id, { status: body?.status });
  }
}
