import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ReferralLinkChannelKind, ReferralLinkOwnerScope, SocialTemplateStatus } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { JwtUser } from "../../auth/jwt-user";
import { PrismaService } from "../../prisma/prisma.service";
import { canGrowth } from "../provider-links/growth-access";
import { trackedPageUrl } from "../provider-links/link-urls";
import { ProviderLinksService } from "../provider-links/provider-links.service";
import { assertContentAllowed, checkContent, ContentGuardError, sanitizeCustomLine } from "./content-guard";
import { bad, contentRefused, MARKETING_ERROR, pickShareLink, shareableClinic } from "./provider-marketing-common";
import { composeCardSvg, qrDataUri, svgToPng, type CardLayout } from "./share-card.render";
import { fillPlaceholders, PROTECTED_FOOTER, SEED_TEMPLATES } from "./social-templates.catalogue";

export const SHARE_CHANNELS = ["WHATSAPP", "SMS", "COPY", "SHARE_SHEET", "DOWNLOAD", "EMAIL"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export interface RenderBody {
  templateId?: string;
  clinicId?: string;
  clinicianId?: string;
  linkId?: string;
  locale?: string;
  customLine?: string;
  png?: boolean;
  /** Staff app doctors may share but never create a link (set by the mobile facade). */
  noLinkCreate?: boolean;
}

@Injectable()
export class SocialTemplatesService {
  private seeded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly links: ProviderLinksService,
  ) {}

  /** Idempotent: 6 slugs x 2 locales = 12 PUBLISHED rows at version 1. Existing rows (including a later RETIRED one) are never overwritten. */
  async ensureSeed(): Promise<void> {
    if (this.seeded) return;
    for (const t of SEED_TEMPLATES) {
      for (const locale of ["ar", "en"] as const) {
        const c = t[locale];
        await this.prisma.socialContentTemplate.upsert({
          where: { slug_locale_version: { slug: t.slug, locale, version: 1 } },
          update: {},
          create: { slug: t.slug, kind: t.kind, locale, title: c.title, body: c.body, layoutKey: t.layoutKey, protectedFooter: PROTECTED_FOOTER[locale], status: SocialTemplateStatus.PUBLISHED, version: 1 },
        });
      }
    }
    this.seeded = true;
  }

  async list(user: JwtUser, q: { locale?: string; kind?: string; clinicId?: string } = {}) {
    const tenantId = this.links.assert(user, "view");
    await this.ensureSeed();
    const rows = await this.prisma.socialContentTemplate.findMany({
      where: { status: SocialTemplateStatus.PUBLISHED, ...(q.locale === "ar" || q.locale === "en" ? { locale: q.locale } : {}), ...(q.kind ? { kind: q.kind as never } : {}) },
      orderBy: [{ slug: "asc" }, { locale: "asc" }],
    });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const used = await this.prisma.socialShareLog.groupBy({ by: ["templateId"], where: { tenantId, createdAt: { gte: since }, ...(q.clinicId ? { clinicId: q.clinicId } : {}) }, _count: { _all: true } });
    const usage = new Map(used.map((u) => [u.templateId, u._count._all]));
    return {
      items: rows.map((r) => ({ id: r.id, slug: r.slug, kind: r.kind, locale: r.locale, title: r.title, body: r.body, layoutKey: r.layoutKey, protectedFooter: r.protectedFooter, version: r.version, shares30d: usage.get(r.id) ?? 0, needsDoctor: r.body.includes("{doctor}") })),
      guardrail: "Approved wording only. Guarantees, cures, price comparisons, testimonials and before-and-after claims are blocked, and the footer cannot be edited.",
    };
  }

  private async doctorName(tenantId: string, clinicId: string, clinicianId: string, locale: "ar" | "en") {
    const listing = await this.prisma.marketplaceListing.findFirst({ where: { tenantId, clinicianId, clinicId }, select: { profileJson: true } });
    const p = (listing?.profileJson ?? {}) as { displayNameEn?: string; displayNameAr?: string };
    const user = await this.prisma.user.findFirst({ where: { id: clinicianId, tenantId, deletedAt: null }, select: { displayName: true } });
    if (!user) throw new NotFoundException("Doctor not found");
    return (locale === "ar" ? p.displayNameAr?.trim() || p.displayNameEn?.trim() : p.displayNameEn?.trim()) || user.displayName;
  }

  /** Resolves (and when the role may, creates) the provider link a share carries. */
  async shareLink(user: JwtUser, tenantId: string, clinicId: string, linkId?: string, noCreate = false) {
    const existing = await pickShareLink(this.prisma, tenantId, clinicId, linkId);
    if (existing) return existing;
    if (noCreate || !canGrowth(user, "create")) throw new ForbiddenException({ code: MARKETING_ERROR.LINK_REQUIRED, message: "Ask an admin to create a link first." });
    const created = await this.links.create(user, { clinicId, ownerScope: ReferralLinkOwnerScope.CLINIC, channelKind: ReferralLinkChannelKind.SOCIAL, label: "Social sharing", tags: { utm_source: "social", utm_medium: "organic" } });
    const row = await this.prisma.providerReferralLink.findFirstOrThrow({ where: { id: created.id, tenantId } });
    return row;
  }

  async render(user: JwtUser, body: RenderBody) {
    const tenantId = this.links.assert(user, "create");
    await this.ensureSeed();
    if (!body.templateId) throw bad(MARKETING_ERROR.INVALID, "templateId is required");
    const tpl = await this.prisma.socialContentTemplate.findFirst({ where: { id: body.templateId, status: SocialTemplateStatus.PUBLISHED } });
    if (!tpl) throw new NotFoundException("Template not found");
    const locale = (body.locale === "ar" || body.locale === "en" ? body.locale : tpl.locale) as "ar" | "en";
    if (locale !== tpl.locale) throw bad(MARKETING_ERROR.INVALID, "locale must match the template language");
    const custom = sanitizeCustomLine(body.customLine);
    try {
      if (custom) assertContentAllowed(custom);
    } catch (e) {
      if (e instanceof ContentGuardError) throw contentRefused(e);
      throw e;
    }
    const clinic = await shareableClinic(this.prisma, tenantId, body.clinicId);
    const link = await this.shareLink(user, tenantId, clinic.id, body.linkId, body.noLinkCreate === true);
    const url = trackedPageUrl(clinic.bookingSlug, link.code);
    const needsDoctor = tpl.body.includes("{doctor}");
    if (needsDoctor && !body.clinicianId) throw bad(MARKETING_ERROR.INVALID, "This template needs a doctor");
    const doctor = body.clinicianId ? await this.doctorName(tenantId, clinic.id, body.clinicianId, locale) : null;
    const clinicName = (locale === "ar" ? clinic.nameAr || clinic.nameEn : clinic.nameEn) || clinic.nameEn;
    const filled = fillPlaceholders(tpl.body, { clinic: clinicName, doctor: doctor ?? undefined, link: url });
    const caption = `${filled}${custom ? `\n${custom}` : ""}\n\n${tpl.protectedFooter}`;
    const findings = checkContent(caption.replace(url, ""));
    if (findings.length) throw contentRefused(new ContentGuardError(findings));
    const layout = (tpl.layoutKey === "story" ? "story" : tpl.layoutKey === "flyer" ? "flyer" : "post") as CardLayout;
    const withoutLink = [filled.replace(url, "").replace(/\s*:\s*$/, "").trim(), custom].filter(Boolean).join(" ");
    const svg = composeCardSvg({ layout, locale, title: tpl.title, body: withoutLink, clinicName, doctorName: doctor, link: url, footer: tpl.protectedFooter, qr: await qrDataUri(url) });
    return { templateId: tpl.id, locale, caption, link: url, linkCode: link.code, layout, svg, ...(body.png ? { pngBase64: (await svgToPng(svg)).toString("base64") } : {}) };
  }

  /** Counts a share (template, channel, clinic). No content, no recipient, no slot time. */
  async recordShare(user: JwtUser, body: { templateId?: string; clinicId?: string; channel?: string }) {
    const tenantId = this.links.assert(user, "create");
    if (!body.templateId) throw bad(MARKETING_ERROR.INVALID, "templateId is required");
    const channel = String(body.channel ?? "").toUpperCase();
    if (!(SHARE_CHANNELS as readonly string[]).includes(channel)) throw bad(MARKETING_ERROR.INVALID, `channel must be one of ${SHARE_CHANNELS.join(", ")}`);
    const tpl = await this.prisma.socialContentTemplate.findUnique({ where: { id: body.templateId }, select: { id: true } });
    if (!tpl) throw new NotFoundException("Template not found");
    const clinic = await shareableClinic(this.prisma, tenantId, body.clinicId);
    const row = await this.prisma.socialShareLog.create({ data: { tenantId, clinicId: clinic.id, templateId: tpl.id, channel, createdBy: user.userId } });
    await this.audit.recordEvent({ tenantId, actorId: user.userId, clinicId: clinic.id, action: "growth.social.shared", resource: "SocialContentTemplate", resourceId: tpl.id, metadata: { channel } });
    return { id: row.id, ok: true };
  }
}
