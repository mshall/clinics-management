import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ClinicRecordStatus,
  ListingStatus,
  PlanKey,
  Prisma,
  ReferralLinkChannelKind,
  ReferralLinkOwnerScope,
  ReferralLinkStatus,
  type ProviderReferralLink,
} from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import { AuditService } from "../../audit/audit.service";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import { PlanUpgradeRequiredException } from "../../entitlements/plan-upgrade-required.exception";
import { MarketplaceProviderProfileService } from "../../marketplace/marketplace-provider-profile.service";
import { PrismaService } from "../../prisma/prisma.service";
import { canGrowth, growthLevel, type GrowthAction } from "./growth-access";
import { growthLimitsFor } from "./growth-plan-limits";
import { generateLinkCode } from "./link-code";
import { utcDay } from "./link-counters";
import { effectiveTags, sanitizeLinkTags } from "./link-tags";
import { shortUrl, trackedPageUrl } from "./link-urls";
import { ProviderLinkCoreService } from "./provider-link-core.service";
import { renderPosterHtml, type PosterKind, type PosterLang, type PosterSize } from "./poster-html";
import { qrPng, qrSvg } from "./qr-svg";
import { DEFAULT_WIDGET_SETTINGS, parseWidgetSettings, validateWidgetOrigins, validateWidgetSettings, widgetSnippets } from "./widget-settings";

export const GROWTH_ERROR = {
  LINK_INVALID: "GROWTH_LINK_INVALID",
  LINK_LIMIT: "GROWTH_LINK_LIMIT_REACHED",
  LINK_REVOKED: "GROWTH_LINK_REVOKED",
  WIDGET_ORIGIN: "GROWTH_WIDGET_ORIGIN_INVALID",
  WIDGET_TOO_MANY: "GROWTH_WIDGET_TOO_MANY_ORIGINS",
  WIDGET_SETTINGS: "GROWTH_WIDGET_SETTINGS_INVALID",
} as const;

export interface CreateLinkBody {
  clinicId?: string;
  ownerScope?: string;
  channelKind?: string;
  label?: string;
  clinicianId?: string;
  branchRef?: string;
  deskLabel?: string;
  tags?: unknown;
}
export interface UpdateLinkBody {
  label?: string;
  status?: string;
  channelKind?: string;
  tags?: unknown;
}
export interface PutWidgetBody {
  clinicId?: string;
  enabled?: boolean;
  allowedOrigins?: unknown;
  theme?: string;
  locale?: string;
  settings?: unknown;
}

const SCOPES = new Set<string>(Object.values(ReferralLinkOwnerScope));
const CHANNELS = new Set<string>(Object.values(ReferralLinkChannelKind));
const THEMES = new Set(["auto", "light", "dark"]);
const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
const bad = (code: string, message: string, extra?: Record<string, unknown>) => new BadRequestException({ code, message, ...extra });

export type LinkTotals = { visits: number; bookings: number; attended: number };
export type LinkDto = {
  id: string;
  code: string;
  label: string;
  ownerScope: ReferralLinkOwnerScope;
  channelKind: ReferralLinkChannelKind;
  status: ReferralLinkStatus;
  clinicId: string;
  clinicianId: string | null;
  branchRef: string | null;
  deskLabel: string | null;
  tags: Record<string, string>;
  targetNameEn: string;
  targetNameAr: string;
  shortUrl: string;
  trackedUrl: string | null;
  createdAt: string;
  revokedAt: string | null;
  last30: LinkTotals;
};

@Injectable()
export class ProviderLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly core: ProviderLinkCoreService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly profiles?: MarketplaceProviderProfileService,
  ) {}

  assert(user: JwtUser, action: GrowthAction): string {
    if (!user.tenantId || !canGrowth(user, action)) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Your role cannot do this in Growth & Marketing" });
    return user.tenantId;
  }

  /** What the signed-in user may do (drives the web workspace). */
  async access(user: JwtUser) {
    const level = growthLevel(user);
    const tenantId = user.tenantId;
    const plan = tenantId ? (await this.entitlements.resolve(tenantId)).plan.key : PlanKey.LITE;
    const limits = growthLimitsFor(plan);
    const used = tenantId ? await this.prisma.providerReferralLink.count({ where: { tenantId, status: { not: ReferralLinkStatus.REVOKED } } }) : 0;
    return {
      level,
      can: { view: canGrowth(user, "view"), create: canGrowth(user, "create"), update: canGrowth(user, "update"), revoke: canGrowth(user, "revoke"), widget: canGrowth(user, "widget") && limits.widget },
      plan: { key: plan, ...limits, linksUsed: used },
    };
  }

  private async clinicFor(tenantId: string, clinicId: string | undefined) {
    if (!clinicId) throw bad(GROWTH_ERROR.LINK_INVALID, "clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId, recordStatus: ClinicRecordStatus.ACTIVE },
      select: { id: true, tenantId: true, nameEn: true, nameAr: true, bookingSlug: true, country: true, phone: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    return clinic;
  }

  private async loadLink(user: JwtUser, id: string, action: GrowthAction): Promise<ProviderReferralLink> {
    const tenantId = this.assert(user, action);
    const row = await this.prisma.providerReferralLink.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Link not found");
    return row;
  }

  // ---------------------------------------------------------------- links

  async list(user: JwtUser, q: { clinicId?: string; status?: string } = {}): Promise<{ items: LinkDto[] }> {
    const tenantId = this.assert(user, "view");
    const where: Prisma.ProviderReferralLinkWhereInput = { tenantId };
    if (q.clinicId) where.clinicId = q.clinicId;
    if (q.status && (Object.values(ReferralLinkStatus) as string[]).includes(q.status)) where.status = q.status as ReferralLinkStatus;
    const rows = await this.prisma.providerReferralLink.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    return { items: await this.toDtos(tenantId, rows) };
  }

  private async toDtos(tenantId: string, rows: ProviderReferralLink[]): Promise<LinkDto[]> {
    if (!rows.length) return [];
    const since = utcDay(new Date(Date.now() - 29 * 86_400_000));
    const [sums, clinics, users] = await Promise.all([
      this.prisma.providerReferralLinkDaily.groupBy({
        by: ["linkId"],
        where: { tenantId, linkId: { in: rows.map((r) => r.id) }, date: { gte: since } },
        _sum: { visits: true, bookings: true, attended: true },
      }),
      this.prisma.clinic.findMany({ where: { tenantId, id: { in: [...new Set(rows.flatMap((r) => [r.clinicId, r.branchRef].filter((x): x is string => Boolean(x))))] } }, select: { id: true, nameEn: true, nameAr: true, bookingSlug: true } }),
      this.prisma.user.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.clinicianId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } }),
    ]);
    const sumBy = new Map(sums.map((s) => [s.linkId, s._sum]));
    const clinicBy = new Map(clinics.map((c) => [c.id, c]));
    const userBy = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const clinic = clinicBy.get(r.ownerScope === ReferralLinkOwnerScope.BRANCH && r.branchRef ? r.branchRef : r.clinicId);
      const doctor = r.clinicianId ? userBy.get(r.clinicianId) : undefined;
      const s = sumBy.get(r.id);
      const nameEn = doctor?.displayName ?? clinic?.nameEn ?? "";
      return {
        id: r.id,
        code: r.code,
        label: r.label,
        ownerScope: r.ownerScope,
        channelKind: r.channelKind,
        status: r.status,
        clinicId: r.clinicId,
        clinicianId: r.clinicianId,
        branchRef: r.branchRef,
        deskLabel: r.deskLabel,
        tags: effectiveTags(r.channelKind, r.tags) as Record<string, string>,
        targetNameEn: nameEn,
        targetNameAr: doctor?.displayName ?? clinic?.nameAr ?? nameEn,
        shortUrl: shortUrl(r.code),
        trackedUrl: clinic?.bookingSlug ? trackedPageUrl(clinic.bookingSlug, r.code) : null,
        createdAt: r.createdAt.toISOString(),
        revokedAt: r.revokedAt?.toISOString() ?? null,
        last30: { visits: s?.visits ?? 0, bookings: s?.bookings ?? 0, attended: s?.attended ?? 0 },
      };
    });
  }

  async create(user: JwtUser, body: CreateLinkBody): Promise<LinkDto> {
    const tenantId = this.assert(user, "create");
    const label = cleanText(String(body.label ?? ""));
    if (label.length < 2 || label.length > 80) throw bad(GROWTH_ERROR.LINK_INVALID, "label must be 2 to 80 characters");
    const ownerScope = String(body.ownerScope ?? "CLINIC");
    if (!SCOPES.has(ownerScope)) throw bad(GROWTH_ERROR.LINK_INVALID, "Unknown ownerScope");
    const channelKind = String(body.channelKind ?? "WEB_LINK");
    if (!CHANNELS.has(channelKind)) throw bad(GROWTH_ERROR.LINK_INVALID, "Unknown channelKind");
    const tags = sanitizeLinkTags(body.tags);
    if (!tags.ok) throw bad(GROWTH_ERROR.LINK_INVALID, `Invalid tag ${tags.key}`, { field: tags.key });

    let clinicId = body.clinicId;
    if (!clinicId && ownerScope === "ORG") {
      clinicId = (await this.prisma.clinic.findFirst({ where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE, parentClinicId: null }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    }
    const clinic = await this.clinicFor(tenantId, clinicId);

    let clinicianId: string | null = null;
    let branchRef: string | null = null;
    let deskLabel: string | null = null;
    if (ownerScope === "DOCTOR") {
      if (!body.clinicianId) throw bad(GROWTH_ERROR.LINK_INVALID, "clinicianId is required for a doctor link");
      const doc = await this.prisma.user.findFirst({ where: { id: body.clinicianId, tenantId, deletedAt: null }, select: { id: true } });
      if (!doc) throw new NotFoundException("Doctor not found");
      clinicianId = doc.id;
    } else if (ownerScope === "BRANCH") {
      if (!body.branchRef) throw bad(GROWTH_ERROR.LINK_INVALID, "branchRef is required for a branch link");
      const branch = await this.clinicFor(tenantId, body.branchRef);
      branchRef = branch.id;
    } else if (ownerScope === "DESK") {
      deskLabel = cleanText(String(body.deskLabel ?? ""));
      if (deskLabel.length < 2 || deskLabel.length > 60) throw bad(GROWTH_ERROR.LINK_INVALID, "deskLabel must be 2 to 60 characters");
    }

    const plan = (await this.entitlements.resolve(tenantId)).plan.key;
    const limits = growthLimitsFor(plan);
    const used = await this.prisma.providerReferralLink.count({ where: { tenantId, status: { not: ReferralLinkStatus.REVOKED } } });
    if (used >= limits.maxActiveLinks) {
      throw new ConflictException({ code: GROWTH_ERROR.LINK_LIMIT, message: "Your plan's link limit is reached. Revoke a link you no longer use or upgrade.", limit: limits.maxActiveLinks, plan });
    }

    let created: ProviderReferralLink | null = null;
    for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
      try {
        created = await this.prisma.providerReferralLink.create({
          data: {
            tenantId,
            clinicId: clinic.id,
            clinicianId,
            branchRef,
            deskLabel,
            ownerScope: ownerScope as ReferralLinkOwnerScope,
            channelKind: channelKind as ReferralLinkChannelKind,
            code: generateLinkCode(),
            label,
            tags: (tags.tags ?? undefined) as Prisma.InputJsonValue | undefined,
            createdBy: user.userId,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }
    if (!created) throw new ConflictException({ code: GROWTH_ERROR.LINK_INVALID, message: "Could not allocate a link code, try again" });
    await this.core.emitCreated(created); // link registry: Kiorex learns the code and its organisation before the first signed token
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: clinic.id,
      action: "growth.link.created",
      resource: "ProviderReferralLink",
      resourceId: created.id,
      metadata: { code: created.code, ownerScope, channelKind, label },
    });
    return (await this.toDtos(tenantId, [created]))[0]!;
  }

  async update(user: JwtUser, id: string, body: UpdateLinkBody): Promise<LinkDto> {
    const existing = await this.loadLink(user, id, "update");
    const data: Prisma.ProviderReferralLinkUpdateInput = {};
    const meta: Record<string, unknown> = {};
    if (body.label !== undefined) {
      const label = cleanText(String(body.label));
      if (label.length < 2 || label.length > 80) throw bad(GROWTH_ERROR.LINK_INVALID, "label must be 2 to 80 characters");
      data.label = label;
      meta.label = label;
    }
    if (body.channelKind !== undefined) {
      if (!CHANNELS.has(body.channelKind)) throw bad(GROWTH_ERROR.LINK_INVALID, "Unknown channelKind");
      data.channelKind = body.channelKind as ReferralLinkChannelKind;
    }
    if (body.tags !== undefined) {
      const tags = sanitizeLinkTags(body.tags);
      if (!tags.ok) throw bad(GROWTH_ERROR.LINK_INVALID, `Invalid tag ${tags.key}`, { field: tags.key });
      data.tags = tags.tags ? (tags.tags as Prisma.InputJsonValue) : Prisma.DbNull;
    }
    let action = "growth.link.updated";
    if (body.status !== undefined) {
      if (existing.status === ReferralLinkStatus.REVOKED) throw new ConflictException({ code: GROWTH_ERROR.LINK_REVOKED, message: "A revoked link cannot be changed" });
      if (body.status === "REVOKED") {
        this.assert(user, "revoke");
        data.status = ReferralLinkStatus.REVOKED;
        data.revokedAt = new Date();
        data.revokedBy = user.userId;
        action = "growth.link.revoked";
      } else if (body.status === "ACTIVE" || body.status === "PAUSED") {
        data.status = body.status as ReferralLinkStatus;
        action = body.status === "PAUSED" ? "growth.link.paused" : "growth.link.resumed";
      } else {
        throw bad(GROWTH_ERROR.LINK_INVALID, "Unknown status");
      }
      meta.status = body.status;
    }
    const row = await this.prisma.providerReferralLink.update({ where: { id }, data });
    if (action === "growth.link.revoked") await this.core.emitRevoked(row); // link registry: a revoked code stops deciding provider-led for new bookings
    await this.audit.recordEvent({ tenantId: existing.tenantId, actorId: user.userId, clinicId: existing.clinicId, action, resource: "ProviderReferralLink", resourceId: id, metadata: { code: existing.code, ...meta } });
    return (await this.toDtos(existing.tenantId, [row]))[0]!;
  }

  // ---------------------------------------------------------------- QR, poster, card

  private async qrTarget(link: ProviderReferralLink) {
    if (link.status === ReferralLinkStatus.REVOKED) throw new ConflictException({ code: GROWTH_ERROR.LINK_REVOKED, message: "This link was revoked" });
    return shortUrl(link.code);
  }

  async qrSvgFor(user: JwtUser, id: string): Promise<string> {
    const link = await this.loadLink(user, id, "view");
    return qrSvg(await this.qrTarget(link));
  }

  async qrPngFor(user: JwtUser, id: string, width?: number): Promise<Buffer> {
    const link = await this.loadLink(user, id, "view");
    return qrPng(await this.qrTarget(link), width);
  }

  private async names(link: ProviderReferralLink) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: link.ownerScope === "BRANCH" && link.branchRef ? link.branchRef : link.clinicId, tenantId: link.tenantId }, select: { nameEn: true, nameAr: true, phone: true, bookingSlug: true } });
    const doctor = link.clinicianId ? await this.prisma.user.findFirst({ where: { id: link.clinicianId, tenantId: link.tenantId }, select: { displayName: true } }) : null;
    const listing = link.clinicianId
      ? await this.prisma.marketplaceListing.findFirst({ where: { clinicId: link.clinicId, clinicianId: link.clinicianId }, select: { profileJson: true } })
      : null;
    const p = (listing?.profileJson ?? {}) as { displayNameEn?: string; displayNameAr?: string; titleEn?: string; titleAr?: string };
    return {
      clinicEn: clinic?.nameEn ?? "",
      clinicAr: clinic?.nameAr ?? clinic?.nameEn ?? "",
      phone: clinic?.phone ?? null,
      slug: clinic?.bookingSlug ?? null,
      doctorEn: p.displayNameEn?.trim() || doctor?.displayName || null,
      doctorAr: p.displayNameAr?.trim() || p.displayNameEn?.trim() || doctor?.displayName || null,
      titleEn: p.titleEn?.trim() || null,
      titleAr: p.titleAr?.trim() || null,
    };
  }

  async posterHtml(user: JwtUser, id: string, opts: { lang?: string; size?: string; kind?: string; print?: boolean }): Promise<string> {
    const link = await this.loadLink(user, id, "view");
    const lang: PosterLang = opts.lang === "en" ? "en" : "ar";
    const size: PosterSize = opts.size === "A5" ? "A5" : "A4";
    const requested = String(opts.kind ?? "").toUpperCase();
    const kind: PosterKind =
      requested === "DOCTOR_CARD" || (!requested && link.ownerScope === "DOCTOR" && link.channelKind === "EMAIL_SIG")
        ? "DOCTOR_CARD"
        : requested === "DESK" || (!requested && link.ownerScope === "DESK")
          ? "DESK"
          : "POSTER";
    if (kind === "DOCTOR_CARD" && link.ownerScope !== "DOCTOR") throw bad(GROWTH_ERROR.LINK_INVALID, "Doctor cards need a doctor link");
    const n = await this.names(link);
    const url = await this.qrTarget(link);
    const svg = await qrSvg(url);
    const doctorName = kind === "DOCTOR_CARD" || link.ownerScope === "DOCTOR";
    return renderPosterHtml({
      kind,
      lang,
      size,
      nameEn: doctorName ? n.doctorEn ?? n.clinicEn : n.clinicEn,
      nameAr: doctorName ? n.doctorAr ?? n.clinicAr : n.clinicAr,
      subtitleEn: doctorName ? n.titleEn ?? n.clinicEn : link.deskLabel,
      subtitleAr: doctorName ? n.titleAr ?? n.clinicAr : link.deskLabel,
      shortUrl: url,
      qrSvg: svg,
      autoPrint: opts.print === true,
    });
  }

  /** Digital business card for a doctor link: vCard 3.0 with the clinic's public contact and the tracked page URL. Only published data, no personal contact details. */
  async vcard(user: JwtUser, id: string): Promise<string> {
    const link = await this.loadLink(user, id, "view");
    if (link.ownerScope !== "DOCTOR") throw bad(GROWTH_ERROR.LINK_INVALID, "A digital business card needs a doctor link");
    const n = await this.names(link);
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\;").replace(/,/g, "\\,");
    const url = n.slug ? trackedPageUrl(n.slug, link.code) : shortUrl(link.code);
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(n.doctorEn ?? n.clinicEn)}`, `N:${esc(n.doctorEn ?? n.clinicEn)};;;;`, `ORG:${esc(n.clinicEn)}`];
    if (n.titleEn) lines.push(`TITLE:${esc(n.titleEn)}`);
    if (n.phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(n.phone)}`);
    lines.push(`URL:${url}`, "NOTE:Book online with Kiorly Clinic by Kiorex", "END:VCARD");
    return lines.join("\r\n") + "\r\n";
  }

  // ---------------------------------------------------------------- summary (counts only)

  async summary(user: JwtUser, q: { clinicId?: string; days?: number } = {}) {
    const tenantId = this.assert(user, "view");
    const days = Math.min(365, Math.max(1, Math.round(q.days ?? 30)));
    const since = utcDay(new Date(Date.now() - (days - 1) * 86_400_000));
    const linkWhere: Prisma.ProviderReferralLinkWhereInput = { tenantId, ...(q.clinicId ? { clinicId: q.clinicId } : {}) };
    const links = await this.prisma.providerReferralLink.findMany({ where: linkWhere, select: { id: true, code: true, label: true, status: true } });
    const ids = links.map((l) => l.id);
    const rows = ids.length
      ? await this.prisma.providerReferralLinkDaily.findMany({ where: { tenantId, linkId: { in: ids }, date: { gte: since } }, orderBy: { date: "asc" } })
      : [];
    const byLink = new Map<string, LinkTotals>();
    const byDay = new Map<string, LinkTotals>();
    const totals: LinkTotals = { visits: 0, bookings: 0, attended: 0 };
    for (const r of rows) {
      const l = byLink.get(r.linkId) ?? { visits: 0, bookings: 0, attended: 0 };
      l.visits += r.visits; l.bookings += r.bookings; l.attended += r.attended;
      byLink.set(r.linkId, l);
      const key = r.date.toISOString().slice(0, 10);
      const d = byDay.get(key) ?? { visits: 0, bookings: 0, attended: 0 };
      d.visits += r.visits; d.bookings += r.bookings; d.attended += r.attended;
      byDay.set(key, d);
      totals.visits += r.visits; totals.bookings += r.bookings; totals.attended += r.attended;
    }
    return {
      days,
      totals,
      byLink: links.map((l) => ({ linkId: l.id, code: l.code, label: l.label, status: l.status, ...(byLink.get(l.id) ?? { visits: 0, bookings: 0, attended: 0 }) })),
      trend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      note: "Counts only. No visitor, patient or device identifiers are stored. Bookings through your links never carry a Kiorex fee.",
    };
  }

  // ---------------------------------------------------------------- widget

  async getWidget(user: JwtUser, clinicId: string) {
    const tenantId = this.assert(user, "view");
    const clinic = await this.clinicFor(tenantId, clinicId);
    const cfg = await this.prisma.bookingWidgetConfig.findUnique({ where: { clinicId: clinic.id } });
    const plan = (await this.entitlements.resolve(tenantId)).plan.key;
    const limits = growthLimitsFor(plan);
    const locale = (cfg?.locale === "en" ? "en" : "ar") as "ar" | "en";
    return {
      clinicId: clinic.id,
      enabled: cfg?.enabled ?? false,
      allowedOrigins: Array.isArray(cfg?.allowedOrigins) ? (cfg!.allowedOrigins as string[]) : [],
      theme: cfg?.theme ?? "auto",
      locale,
      settings: cfg ? parseWidgetSettings(cfg.settings) : { ...DEFAULT_WIDGET_SETTINGS },
      updatedAt: cfg?.updatedAt.toISOString() ?? null,
      entitled: limits.widget,
      requiredPlan: limits.widget ? null : PlanKey.PRO,
      maxOrigins: 10,
      snippets: clinic.bookingSlug ? widgetSnippets({ slug: clinic.bookingSlug, locale }) : null,
      note: "Widget bookings carry your link token and never carry a Kiorex fee. The widget host is a proposed address until Kiorex confirms it.",
    };
  }

  async putWidget(user: JwtUser, body: PutWidgetBody) {
    const tenantId = this.assert(user, "widget");
    const clinic = await this.clinicFor(tenantId, body.clinicId);
    const plan = (await this.entitlements.resolve(tenantId)).plan.key;
    if (!growthLimitsFor(plan).widget) throw new PlanUpgradeRequiredException("growth_widget", PlanKey.PRO);

    const origins = validateWidgetOrigins(body.allowedOrigins);
    if (!origins.ok) {
      if (origins.reason === "TOO_MANY") throw bad(GROWTH_ERROR.WIDGET_TOO_MANY, "At most 10 origins are allowed", { max: 10 });
      throw bad(GROWTH_ERROR.WIDGET_ORIGIN, `Origin not allowed: ${origins.reason}`, { reason: origins.reason, origin: origins.origin });
    }
    const theme = body.theme ?? "auto";
    if (!THEMES.has(theme)) throw bad(GROWTH_ERROR.WIDGET_SETTINGS, "theme must be auto, light or dark", { field: "theme" });
    const locale = body.locale ?? "ar";
    if (locale !== "ar" && locale !== "en") throw bad(GROWTH_ERROR.WIDGET_SETTINGS, "locale must be ar or en", { field: "locale" });
    const enabled = body.enabled === true;
    const settings = validateWidgetSettings(body.settings);
    if (!settings.ok) throw bad(GROWTH_ERROR.WIDGET_SETTINGS, `Invalid ${settings.field}`, { field: settings.field });
    if (settings.settings.doctorIds.length) {
      const found = await this.prisma.marketplaceListing.count({ where: { tenantId, clinicId: clinic.id, clinicianId: { in: settings.settings.doctorIds } } });
      if (found !== new Set(settings.settings.doctorIds).size) throw bad(GROWTH_ERROR.WIDGET_SETTINGS, "Unknown doctor", { field: "doctorIds" });
    }
    if (settings.settings.branchIds.length) {
      const found = await this.prisma.clinic.count({ where: { tenantId, id: { in: settings.settings.branchIds } } });
      if (found !== new Set(settings.settings.branchIds).size) throw bad(GROWTH_ERROR.WIDGET_SETTINGS, "Unknown branch", { field: "branchIds" });
    }

    const before = await this.prisma.bookingWidgetConfig.findUnique({ where: { clinicId: clinic.id } });
    const data = {
      enabled,
      allowedOrigins: origins.origins as Prisma.InputJsonValue,
      theme,
      locale,
      settings: settings.settings as unknown as Prisma.InputJsonValue,
      updatedBy: user.userId,
    };
    await this.prisma.bookingWidgetConfig.upsert({ where: { clinicId: clinic.id }, create: { tenantId, clinicId: clinic.id, ...data }, update: data });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: clinic.id,
      action: "growth.widget.updated",
      resource: "BookingWidgetConfig",
      resourceId: clinic.id,
      metadata: { enabledBefore: before?.enabled ?? false, enabledAfter: enabled, originsBefore: (before?.allowedOrigins as string[] | undefined) ?? [], originsAfter: origins.origins },
    });
    // Kiorex learns the allowlist through the profile projection (PROVIDER_PROFILE_UPDATED.widgetOrigins), same outbox, same retry semantics.
    if (this.profiles) await this.profiles.republishClinicProfiles(tenantId, clinic.id);
    return this.getWidget(user, clinic.id);
  }

  /** Public profile preview: the booking page exactly as a patient sees it (slug, doctors, visit types). */
  async profilePreview(user: JwtUser, clinicId: string) {
    const tenantId = this.assert(user, "view");
    const clinic = await this.clinicFor(tenantId, clinicId);
    const listings = await this.prisma.marketplaceListing.findMany({
      where: { tenantId, clinicId: clinic.id, status: ListingStatus.LIVE },
      select: { clinicianId: true, bookingSlug: true, profileJson: true, clinician: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    const types = await this.prisma.appointmentType.count({ where: { clinicId: clinic.id, isActive: true, marketplaceBookable: true } });
    return {
      clinicId: clinic.id,
      nameEn: clinic.nameEn,
      nameAr: clinic.nameAr,
      slug: clinic.bookingSlug,
      pageUrl: clinic.bookingSlug ? trackedPageUrl(clinic.bookingSlug, "").replace(/\?s=$/, "") : null,
      bookableVisitTypes: types,
      doctors: listings.map((l) => {
        const p = (l.profileJson ?? {}) as { displayNameEn?: string; displayNameAr?: string; titleEn?: string; titleAr?: string };
        return { clinicianId: l.clinicianId, slug: l.bookingSlug, nameEn: p.displayNameEn?.trim() || l.clinician.displayName, nameAr: p.displayNameAr?.trim() || p.displayNameEn?.trim() || l.clinician.displayName, titleEn: p.titleEn ?? null, titleAr: p.titleAr ?? null };
      }),
      ready: Boolean(clinic.bookingSlug) && listings.length > 0 && types > 0,
    };
  }
}
