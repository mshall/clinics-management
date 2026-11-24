import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentType, ListingStatus } from "@prisma/client";
import { DateTime } from "luxon";
import type { JwtUser } from "../../auth/jwt-user";
import { PrismaService } from "../../prisma/prisma.service";
import { SlotService } from "../../scheduling/slot.service";
import { SLOT_CHANNEL } from "../../scheduling/slot-channel";
import { trackedSlotUrl } from "../provider-links/link-urls";
import { ProviderLinksService } from "../provider-links/provider-links.service";
import { bad, MARKETING_ERROR, shareableClinic } from "./provider-marketing-common";
import { composeCardSvg, qrDataUri, svgToPng } from "./share-card.render";
import { PROTECTED_FOOTER, SLOT_CARD_TEXT } from "./social-templates.catalogue";
import { SocialTemplatesService } from "./social-templates.service";

export const SHAREABLE_SLOTS_MAX = 5;
export const SHAREABLE_SLOTS_MAX_DAYS = 7;

export interface ShareableSlot {
  startsAt: string;
  endsAt: string;
  /** Formatted in the CLINIC time zone (never the server's or the viewer's). */
  labelEn: string;
  labelAr: string;
}

/** Pure: the next free slots, earliest first, de-duplicated by start, strictly in the future, capped. */
export function pickNextSlots<T extends { startsAt: string }>(slots: T[], now: Date, limit = SHAREABLE_SLOTS_MAX): T[] {
  const seen = new Set<string>();
  return slots
    .filter((s) => Date.parse(s.startsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .filter((s) => (seen.has(s.startsAt) ? false : (seen.add(s.startsAt), true)))
    .slice(0, limit);
}

export function slotLabel(startsAtIso: string, timezone: string, locale: "ar" | "en"): string {
  const dt = DateTime.fromISO(startsAtIso, { zone: "utc" }).setZone(timezone || "Africa/Cairo").setLocale(locale === "ar" ? "ar-EG" : "en-GB");
  return dt.toFormat(locale === "ar" ? "cccc d LLLL، h:mm a" : "ccc d LLL, HH:mm");
}

/** GRW-P2-C shareable available-slot cards. Reads the canonical slot engine; never creates a hold, a booking or any row (a card is a read-only snapshot). */
@Injectable()
export class ShareableSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotService,
    private readonly links: ProviderLinksService,
    private readonly templates: SocialTemplatesService,
  ) {}

  private async doctor(user: JwtUser, tenantId: string, clinicId: string, clinicianId: string | undefined, selfOnly: boolean) {
    const id = selfOnly ? user.userId : clinicianId;
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { tenantId, clinicId, status: ListingStatus.LIVE, ...(id ? { clinicianId: id } : {}) },
      orderBy: { createdAt: "asc" },
      select: { clinicianId: true, profileJson: true },
    });
    if (!listing) throw new NotFoundException({ code: MARKETING_ERROR.INVALID, message: "No live doctor profile to share slots for" });
    return listing;
  }

  /** The shortest marketplace-bookable, in-clinic type of the doctor (the one the capacity view uses). */
  private async slotType(tenantId: string, clinicId: string, clinicianId: string): Promise<AppointmentType> {
    const types = await this.prisma.appointmentType.findMany({ where: { tenantId, isActive: true, marketplaceBookable: true, OR: [{ clinicId }, { clinicId: null }] }, orderBy: [{ durationMinutes: "asc" }, { id: "asc" }] });
    const t = types.find((x) => x.serviceLocation !== "HOME" && x.serviceLocation !== "VIDEO") ?? null;
    if (!t) throw new ConflictException({ code: MARKETING_ERROR.INVALID, message: "No bookable visit type: nothing to share yet", clinicianId });
    return t;
  }

  async list(user: JwtUser, q: { clinicId?: string; clinicianId?: string; days?: number; selfOnly?: boolean; now?: Date } = {}): Promise<{ clinicId: string; clinicianId: string; timezone: string; days: number; items: ShareableSlot[]; typeId: string }> {
    const tenantId = this.links.assert(user, "create");
    return this.listFor(tenantId, q.clinicId, q.clinicianId, q.days, user, q.selfOnly === true, q.now);
  }

  async listFor(tenantId: string, clinicId: string | undefined, clinicianId: string | undefined, days: number | undefined, user: JwtUser, selfOnly: boolean, nowOverride?: Date) {
    const clinic = await shareableClinic(this.prisma, tenantId, clinicId);
    const listing = await this.doctor(user, tenantId, clinic.id, clinicianId, selfOnly);
    const type = await this.slotType(tenantId, clinic.id, listing.clinicianId);
    const now = nowOverride ?? new Date();
    const span = Math.min(SHAREABLE_SLOTS_MAX_DAYS, Math.max(1, Math.round(days ?? 3)));
    const res = await this.slots.getSlots({ tenantId, clinicId: clinic.id, clinicianId: listing.clinicianId, typeId: type.id, from: now, to: new Date(now.getTime() + span * 86_400_000), channel: SLOT_CHANNEL.MARKETPLACE });
    const tz = clinic.timezone || "Africa/Cairo";
    const items = pickNextSlots(res.slots, now).map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, labelEn: slotLabel(s.startsAt, tz, "en"), labelAr: slotLabel(s.startsAt, tz, "ar") }));
    return { clinicId: clinic.id, clinicianId: listing.clinicianId, timezone: tz, days: span, items, typeId: type.id };
  }

  /**
   * Renders a card for 1 to 5 slots. Every selected start is re-checked against the engine at render time: a slot that was taken or has passed answers
   * 409 SLOT_NO_LONGER_AVAILABLE with the slots that remain, so a stale tab or a double click can never publish a time that is gone.
   */
  async card(user: JwtUser, body: { clinicId?: string; clinicianId?: string; startsAt?: unknown; linkId?: string; locale?: string; png?: boolean; selfOnly?: boolean; noLinkCreate?: boolean; now?: Date }) {
    const tenantId = this.links.assert(user, "create");
    const starts = Array.isArray(body.startsAt) ? body.startsAt.map(String) : [];
    if (starts.length < 1 || starts.length > SHAREABLE_SLOTS_MAX) throw bad(MARKETING_ERROR.INVALID, `Choose 1 to ${SHAREABLE_SLOTS_MAX} slots`);
    const locale = body.locale === "ar" ? "ar" : "en";
    const now = body.now ?? new Date();
    const normalized = [...new Set(starts.map((s) => { const t = Date.parse(s); if (!Number.isFinite(t)) throw bad(MARKETING_ERROR.INVALID, "startsAt must be ISO date-times"); return new Date(t).toISOString(); }))].sort();
    const fresh = await this.listFor(tenantId, body.clinicId, body.clinicianId, SHAREABLE_SLOTS_MAX_DAYS, user, body.selfOnly === true, now);
    // a chosen slot may sit beyond the first 5 free ones: check against the full week before declaring one gone
    const full = await this.fullWeek(tenantId, fresh, now);
    const gone = normalized.filter((s) => !full.has(s));
    if (gone.length) {
      throw new ConflictException({ code: MARKETING_ERROR.SLOT_GONE, message: "One of the selected times is no longer available.", gone, remaining: fresh.items });
    }
    const clinic = await shareableClinic(this.prisma, tenantId, fresh.clinicId);
    const link = await this.templates.shareLink(user, tenantId, clinic.id, body.linkId, body.noLinkCreate === true);
    const url = trackedSlotUrl(clinic.bookingSlug, link.code, normalized[0]!);
    const t = SLOT_CARD_TEXT[locale];
    const clinicName = (locale === "ar" ? clinic.nameAr || clinic.nameEn : clinic.nameEn) || clinic.nameEn;
    const lines = normalized.map((s) => slotLabel(s, fresh.timezone, locale));
    const svg = composeCardSvg({ layout: "slots", locale, title: t.title, body: t.intro.replace("{clinic}", clinicName), lines, clinicName, link: url, footer: PROTECTED_FOOTER[locale], qr: await qrDataUri(url) });
    const caption = `${t.intro.replace("{clinic}", clinicName)}\n${lines.map((l) => `- ${l}`).join("\n")}\n${t.cta}: ${url}\n\n${PROTECTED_FOOTER[locale]}`;
    return { clinicId: clinic.id, clinicianId: fresh.clinicianId, locale, link: url, linkCode: link.code, slots: normalized, caption, svg, ...(body.png ? { pngBase64: (await svgToPng(svg)).toString("base64") } : {}) };
  }

  private async fullWeek(tenantId: string, fresh: { clinicId: string; clinicianId: string; typeId: string }, now: Date): Promise<Set<string>> {
    const res = await this.slots.getSlots({ tenantId, clinicId: fresh.clinicId, clinicianId: fresh.clinicianId, typeId: fresh.typeId, from: now, to: new Date(now.getTime() + SHAREABLE_SLOTS_MAX_DAYS * 86_400_000), channel: SLOT_CHANNEL.MARKETPLACE });
    return new Set(res.slots.filter((s) => Date.parse(s.startsAt) > now.getTime()).map((s) => new Date(s.startsAt).toISOString()));
  }
}
