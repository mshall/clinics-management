import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ClinicRecordStatus, ListingStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  BOOKING_SLUG_ERROR,
  bookingSlugCandidates,
  isValidBookingSlug,
  slugifyBookingName,
} from "./booking-slug";
import { ProviderLinkCoreService } from "../growth/provider-links/provider-link-core.service";
import { widgetEmbedUrl } from "../growth/provider-links/link-urls";
import { MarketplaceListingService } from "./marketplace-listing.service";
import type { ProviderProfileJson } from "./provider-profile-schema";

export const CLINIC_LINK_CHANNEL = "CLINIC_LINK" as const;

export type PutBookingSlugBody = {
  clinicId: string;
  slug: string;
  /** When set, updates the doctor's slug instead of the clinic's. */
  listingId?: string;
};

function bookingLinkBaseUrl(): string {
  const explicit = process.env.BOOKING_LINK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const web = process.env.APP_WEB_URL?.trim() || "http://localhost:5173";
  return `${web.replace(/\/$/, "")}/b`;
}

export function bookingPageUrl(slug: string): string {
  return `${bookingLinkBaseUrl()}/${encodeURIComponent(slug)}`;
}

/** @deprecated GRW-P1-D1: the public page now uses `widgetEmbedUrl` (never null). Kept for callers that need the raw dedicated-widget URL. */
export function kiorexWidgetUrl(slug: string, clinicId: string, clinicianId?: string): string | null {
  const base = process.env.KIOREX_BOOKING_WIDGET_URL?.trim();
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("clinicId", clinicId);
  if (clinicianId) url.searchParams.set("clinicianId", clinicianId);
  url.searchParams.set("channel", CLINIC_LINK_CHANNEL);
  url.searchParams.set("slug", slug);
  return url.toString();
}

function doctorNames(profile: unknown, fallback: string) {
  const p = (profile ?? {}) as ProviderProfileJson;
  return {
    nameEn: p.displayNameEn?.trim() || fallback,
    nameAr: p.displayNameAr?.trim() || p.displayNameEn?.trim() || fallback,
    titleEn: p.titleEn?.trim() || null,
    titleAr: p.titleAr?.trim() || null,
    specialty: p.specialty ?? null,
  };
}

@Injectable()
export class ClinicBookingPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: MarketplaceListingService,
    private readonly audit: AuditService,
    /** GRW-P1-D1: provider links (`?s=` touch, signed `lt`). Optional so older constructions keep working. */
    @Optional() private readonly links?: ProviderLinkCoreService,
  ) {}

  private async slugTaken(slug: string, except?: { clinicId?: string; listingId?: string }) {
    const [clinic, listing] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { bookingSlug: slug }, select: { id: true } }),
      this.prisma.marketplaceListing.findFirst({ where: { bookingSlug: slug }, select: { id: true } }),
    ]);
    if (clinic && clinic.id !== except?.clinicId) return true;
    if (listing && listing.id !== except?.listingId) return true;
    return false;
  }

  private async freeSlug(name: string, fallback: string): Promise<string> {
    const base = slugifyBookingName(name, fallback);
    for (const candidate of bookingSlugCandidates(base, () => randomBytes(2).toString("hex"))) {
      if (!(await this.slugTaken(candidate))) return candidate;
    }
    return `${fallback}-${randomBytes(4).toString("hex")}`;
  }

  private async loadClinic(user: JwtUser, clinicId: string) {
    if (!clinicId) throw new BadRequestException("clinicId is required");
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId: user.tenantId ?? undefined },
      select: { id: true, tenantId: true, nameEn: true, nameAr: true, bookingSlug: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    this.listings.assertClinicManage(user, clinic.tenantId);
    return clinic;
  }

  /** Kiorex tab "Your booking link": assigns slugs on first view so every clinic has a page. */
  async getForClinic(user: JwtUser, clinicId: string) {
    const clinic = await this.loadClinic(user, clinicId);
    let clinicSlug = clinic.bookingSlug;
    if (!clinicSlug) {
      clinicSlug = await this.freeSlug(clinic.nameEn, "clinic");
      await this.prisma.clinic.update({ where: { id: clinic.id }, data: { bookingSlug: clinicSlug } });
    }
    const rows = await this.prisma.marketplaceListing.findMany({
      where: { clinicId: clinic.id, status: ListingStatus.LIVE },
      select: {
        id: true,
        clinicianId: true,
        bookingSlug: true,
        profileJson: true,
        clinician: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const doctors = [];
    for (const row of rows) {
      const names = doctorNames(row.profileJson, row.clinician.displayName);
      let slug = row.bookingSlug;
      if (!slug) {
        slug = await this.freeSlug(names.nameEn, "doctor");
        await this.prisma.marketplaceListing.update({ where: { id: row.id }, data: { bookingSlug: slug } });
      }
      doctors.push({
        listingId: row.id,
        clinicianId: row.clinicianId,
        nameEn: names.nameEn,
        nameAr: names.nameAr,
        slug,
        url: bookingPageUrl(slug),
      });
    }
    return {
      clinicId: clinic.id,
      clinicNameEn: clinic.nameEn,
      clinicNameAr: clinic.nameAr,
      slug: clinicSlug,
      url: bookingPageUrl(clinicSlug),
      channel: CLINIC_LINK_CHANNEL,
      commissionFree: true,
      doctors,
    };
  }

  async updateSlug(user: JwtUser, body: PutBookingSlugBody) {
    const clinic = await this.loadClinic(user, body.clinicId);
    const slug = (body.slug ?? "").trim().toLowerCase();
    if (!isValidBookingSlug(slug)) {
      throw new BadRequestException({ code: BOOKING_SLUG_ERROR.INVALID, message: "Use 3–40 letters, digits or hyphens" });
    }
    let before: string | null;
    if (body.listingId) {
      const listing = await this.prisma.marketplaceListing.findFirst({
        where: { id: body.listingId, clinicId: clinic.id },
        select: { id: true, bookingSlug: true },
      });
      if (!listing) throw new NotFoundException("Listing not found");
      if (await this.slugTaken(slug, { listingId: listing.id })) {
        throw new ConflictException({ code: BOOKING_SLUG_ERROR.TAKEN, message: "This link is already in use" });
      }
      before = listing.bookingSlug;
      await this.prisma.marketplaceListing.update({ where: { id: listing.id }, data: { bookingSlug: slug } });
    } else {
      if (await this.slugTaken(slug, { clinicId: clinic.id })) {
        throw new ConflictException({ code: BOOKING_SLUG_ERROR.TAKEN, message: "This link is already in use" });
      }
      before = clinic.bookingSlug;
      await this.prisma.clinic.update({ where: { id: clinic.id }, data: { bookingSlug: slug } });
    }
    await this.audit.recordEvent({
      tenantId: clinic.tenantId,
      actorId: user.userId,
      clinicId: clinic.id,
      action: "kiorex.booking_link.slug_updated",
      resource: body.listingId ? "MarketplaceListing" : "Clinic",
      resourceId: body.listingId ?? clinic.id,
      metadata: { before, after: slug },
    });
    return this.getForClinic(user, clinic.id);
  }

  /** Public, unauthenticated page payload. Never returns patient data. */
  async publicPage(rawSlug: string, opts?: { s?: string | null; bot?: boolean }) {
    const slug = (rawSlug ?? "").trim().toLowerCase();
    if (!isValidBookingSlug(slug)) throw new NotFoundException("Booking page not found");

    let clinicId: string | null = null;
    let onlyClinicianId: string | null = null;
    const clinicHit = await this.prisma.clinic.findFirst({ where: { bookingSlug: slug }, select: { id: true } });
    if (clinicHit) {
      clinicId = clinicHit.id;
    } else {
      const listingHit = await this.prisma.marketplaceListing.findFirst({
        where: { bookingSlug: slug, status: ListingStatus.LIVE },
        select: { clinicId: true, clinicianId: true },
      });
      if (listingHit) {
        clinicId = listingHit.clinicId;
        onlyClinicianId = listingHit.clinicianId;
      }
    }
    if (!clinicId) throw new NotFoundException("Booking page not found");

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, recordStatus: ClinicRecordStatus.ACTIVE },
      select: {
        id: true,
        tenantId: true,
        country: true,
        nameEn: true,
        nameAr: true,
        logoUrl: true,
        invoiceBackgroundColor: true,
        city: true,
        addressEn: true,
        addressAr: true,
        locationUrl: true,
        phone: true,
        defaultCurrency: true,
      },
    });
    if (!clinic) throw new NotFoundException("Booking page not found");

    const [listings, types] = await Promise.all([
      this.prisma.marketplaceListing.findMany({
        where: {
          clinicId: clinic.id,
          status: ListingStatus.LIVE,
          ...(onlyClinicianId ? { clinicianId: onlyClinicianId } : {}),
        },
        select: { clinicianId: true, bookingSlug: true, profileJson: true, clinician: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.appointmentType.findMany({
        where: { clinicId: clinic.id, isActive: true, marketplaceBookable: true },
        select: { id: true, nameEn: true, nameAr: true, durationMinutes: true, feeAmount: true },
        orderBy: { nameEn: "asc" },
      }),
    ]);

    // GRW-P1-D1: `?s=<code>` of an ACTIVE link of this organisation counts one visit (no cookie, bots filtered) and yields the signed `lt`; anything else is ignored.
    const touch = opts?.s && this.links ? await this.links.touch(opts.s, clinic.tenantId, { bot: opts.bot === true }) : null;
    const lt = touch?.lt ?? null;
    const embed = (clinicianId: string | undefined, doctorSlug: string | null) =>
      widgetEmbedUrl({
        kind: doctorSlug ? "doctor" : "clinic",
        slug: doctorSlug ?? slug,
        pageSlug: slug,
        clinicId: clinic.id,
        clinicianId,
        country: clinic.country,
        lt,
        channelKind: touch?.link.channelKind,
        tags: touch?.link.tags,
      });

    return {
      slug,
      channel: CLINIC_LINK_CHANNEL,
      commissionFree: true,
      tracked: Boolean(touch),
      lt,
      clinic: {
        id: clinic.id,
        nameEn: clinic.nameEn,
        nameAr: clinic.nameAr,
        logoUrl: clinic.logoUrl,
        brandColor: clinic.invoiceBackgroundColor,
        city: clinic.city,
        addressEn: clinic.addressEn,
        addressAr: clinic.addressAr,
        locationUrl: clinic.locationUrl,
        phone: clinic.phone,
        currency: clinic.defaultCurrency,
      },
      doctors: listings.map((l) => ({
        clinicianId: l.clinicianId,
        slug: l.bookingSlug,
        ...doctorNames(l.profileJson, l.clinician.displayName),
        widgetUrl: embed(l.clinicianId, l.bookingSlug),
      })),
      appointmentTypes: types.map((t) => ({
        id: t.id,
        nameEn: t.nameEn,
        nameAr: t.nameAr,
        durationMinutes: t.durationMinutes,
        feeAmount: t.feeAmount?.toString() ?? null,
      })),
      widgetUrl: embed(onlyClinicianId ?? undefined, onlyClinicianId ? slug : null),
      widgetEmbedUrl: embed(onlyClinicianId ?? undefined, onlyClinicianId ? slug : null),
    };
  }

}

/** Booking-side guard: a CLINIC_LINK booking that names a slug must be for that page's clinic (and doctor). */
export async function assertBookingSlugMatchesClinic(
  prisma: PrismaService,
  rawSlug: string | undefined,
  clinicId: string,
  clinicianId: string,
) {
  const slug = (rawSlug ?? "").trim().toLowerCase();
  if (!slug) return;
  const [clinic, listing] = await Promise.all([
    prisma.clinic.findFirst({ where: { bookingSlug: slug }, select: { id: true } }),
    prisma.marketplaceListing.findFirst({
      where: { bookingSlug: slug },
      select: { clinicId: true, clinicianId: true },
    }),
  ]);
  const ok =
    (clinic && clinic.id === clinicId) ||
    (listing && listing.clinicId === clinicId && listing.clinicianId === clinicianId);
  if (!ok) throw new BadRequestException({ code: "BOOKING_PAGE_MISMATCH", message: "Booking page does not match clinic" });
}
