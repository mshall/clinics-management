import { Injectable } from "@nestjs/common";
import { ListingStatus, Prisma, ReferralLinkOwnerScope, ReferralLinkStatus, type ProviderReferralLink } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { bumpLinkCounter } from "./link-counters";
import { normalizeLinkCode } from "./link-code";
import { signLinkTouch, verifyLinkTouch } from "./link-touch";
import { enqueueLinkEvent, REFERRAL_LINK_CREATED, REFERRAL_LINK_REVOKED, toReferralLinkRecord, type ReferralLinkRecord } from "./link-registry";

export interface LinkTarget {
  kind: "clinic" | "doctor";
  /** Public booking page slug of the target (clinic or doctor). */
  slug: string | null;
  clinicId: string;
  clinicianId: string | null;
  country: string | null;
}

/**
 * Dependency-light half of the provider-link feature (Prisma only), importable by the Marketplace module (public page, booking intake) without a
 * module cycle. Management (CRUD, QR, widget, summary) lives in ProviderLinksService.
 */
@Injectable()
export class ProviderLinkCoreService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(rawCode: unknown): Promise<ProviderReferralLink | null> {
    const code = normalizeLinkCode(rawCode);
    if (!code) return null;
    return this.prisma.providerReferralLink.findUnique({ where: { code } });
  }

  // ---- link registry (contracts 1.11.0): Kiorex learns codes and revocations from events and can read any code back through a signed marketplace call ----

  async emitCreated(link: ProviderReferralLink): Promise<void> {
    await enqueueLinkEvent(this.prisma, REFERRAL_LINK_CREATED, link);
  }

  async emitRevoked(link: ProviderReferralLink, reason = "PROVIDER_REQUEST"): Promise<void> {
    await enqueueLinkEvent(this.prisma, REFERRAL_LINK_REVOKED, link, reason);
  }

  /** Signed lookup for Kiorex (marketplace HMAC). Code, organisation, status only. */
  async lookupRecord(rawCode: unknown): Promise<ReferralLinkRecord | null> {
    const link = await this.findByCode(rawCode);
    return link ? toReferralLinkRecord(link) : null;
  }

  /** Reconciliation feed: links changed since `updatedSince`, oldest first, keyset-paged on (updatedAt, id). */
  async listRecords(opts: { updatedSince?: Date; limit?: number; cursor?: string }): Promise<{ items: ReferralLinkRecord[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? 200), 1), 500);
    let after: { at: Date; id: string } | null = null;
    if (opts.cursor) {
      const [ms, id] = Buffer.from(opts.cursor, "base64url").toString("utf8").split("|");
      if (ms && id && Number.isFinite(Number(ms))) after = { at: new Date(Number(ms)), id };
    }
    const where: Prisma.ProviderReferralLinkWhereInput = {};
    if (after) where.OR = [{ updatedAt: { gt: after.at } }, { updatedAt: after.at, id: { gt: after.id } }];
    else if (opts.updatedSince) where.updatedAt = { gte: opts.updatedSince };
    const rows = await this.prisma.providerReferralLink.findMany({ where, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? Buffer.from(`${last.updatedAt.getTime()}|${last.id}`).toString("base64url") : null;
    return { items: page.map(toReferralLinkRecord), nextCursor };
  }

  /** Where the link points: DOCTOR -> the doctor's page, BRANCH -> that branch's page, everything else -> the clinic page. Slugs are read, never assigned here. */
  async resolveTarget(link: Pick<ProviderReferralLink, "ownerScope" | "clinicId" | "clinicianId" | "branchRef" | "tenantId">): Promise<LinkTarget | null> {
    const clinicId = link.ownerScope === ReferralLinkOwnerScope.BRANCH && link.branchRef ? link.branchRef : link.clinicId;
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: link.tenantId },
      select: { id: true, bookingSlug: true, country: true },
    });
    if (!clinic) return null;
    if (link.ownerScope === ReferralLinkOwnerScope.DOCTOR && link.clinicianId) {
      const listing = await this.prisma.marketplaceListing.findFirst({
        where: { clinicId: link.clinicId, clinicianId: link.clinicianId, status: ListingStatus.LIVE, bookingSlug: { not: null } },
        select: { bookingSlug: true },
      });
      if (listing?.bookingSlug) return { kind: "doctor", slug: listing.bookingSlug, clinicId: clinic.id, clinicianId: link.clinicianId, country: clinic.country };
    }
    return { kind: "clinic", slug: clinic.bookingSlug, clinicId: clinic.id, clinicianId: null, country: clinic.country };
  }

  /**
   * Public page / redirect touch. `s` must be a well-formed code of an ACTIVE link of the SAME organisation as the page; anything else is ignored
   * (no error, no signal to the visitor). Counts one visit per non-bot hit and returns the signed `lt`.
   */
  async touch(rawCode: unknown, pageTenantId: string, opts: { bot: boolean; now?: Date }): Promise<{ link: ProviderReferralLink; lt: string | null } | null> {
    const link = await this.findByCode(rawCode);
    if (!link || link.tenantId !== pageTenantId || link.status !== ReferralLinkStatus.ACTIVE) return null;
    if (!opts.bot) await bumpLinkCounter(this.prisma, link, "visits", opts.now);
    return { link, lt: signLinkTouch({ tenantId: link.tenantId, code: link.code, now: opts.now }) };
  }

  /**
   * Booking intake: a valid, unexpired `lt` for an ACTIVE link of the booking's own organisation makes the booking provider-led. The link is
   * re-read here, so a link revoked after the page was served stops attributing immediately.
   */
  async verifyForBooking(lt: unknown, bookingTenantId: string, now = new Date()): Promise<ProviderReferralLink | null> {
    if (lt === undefined || lt === null || lt === "") return null;
    const v = verifyLinkTouch(lt, { now });
    if (!v.ok) return null;
    if (v.claims.o !== bookingTenantId) return null;
    const link = await this.findByCode(v.claims.c);
    if (!link || link.tenantId !== bookingTenantId || link.status !== ReferralLinkStatus.ACTIVE) return null;
    return link;
  }

  async countBooking(tx: Pick<Prisma.TransactionClient, "$executeRaw">, link: Pick<ProviderReferralLink, "id" | "tenantId">, at?: Date): Promise<void> {
    await bumpLinkCounter(tx, link, "bookings", at);
  }
}
