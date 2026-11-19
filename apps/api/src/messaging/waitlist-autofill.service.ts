import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  AppointmentStatus,
  AppointmentWaitlistStatus,
  BookingSource,
  MessageChannel,
  Prisma,
  WaitlistOfferStatus,
  WaitlistOpenSlotStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { SlotService } from "../scheduling/slot.service";
import { AppointmentOutboxService } from "./appointment-outbox.service";
import { MessagingService } from "./messaging.service";
import {
  WAITLIST_OFFER_TEMPLATE_KEY,
  WAITLIST_BOOKED_TEMPLATE_KEY,
  WAITLIST_CLOSED_TEMPLATE_KEY,
  type WhatsAppReplyAction,
} from "./whatsapp-reply-payloads";

const SCAN_MS = 15_000;
export const DEFAULT_WAITLIST_OFFER_HOLD_MINUTES = 15;

/** Market pack `providerConfig.messaging.waitlist.offerHoldMinutes` (5–120), default 15. */
export function waitlistOfferHoldMinutes(providerConfig: unknown): number {
  const raw = (providerConfig as { messaging?: { waitlist?: { offerHoldMinutes?: unknown } } } | null)?.messaging?.waitlist
    ?.offerHoldMinutes;
  const n = typeof raw === "number" ? raw : Number.NaN;
  return Number.isInteger(n) && n >= 5 && n <= 120 ? n : DEFAULT_WAITLIST_OFFER_HOLD_MINUTES;
}

type Candidate = { id: string; patientId: string; preferredFrom: Date | null; preferredTo: Date | null };

/** Waiting entries that fit the slot, oldest first. Entries already offered this slot are excluded by the caller. */
export function eligibleForSlot<T extends Candidate>(entries: T[], slotStartsAt: Date): T[] {
  const t = slotStartsAt.getTime();
  return entries.filter(
    (e) => (!e.preferredFrom || e.preferredFrom.getTime() <= t) && (!e.preferredTo || e.preferredTo.getTime() >= t),
  );
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

@Injectable()
export class WaitlistAutofillService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WaitlistAutofillService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly audit: AuditService,
    private readonly appointmentOutbox: AppointmentOutboxService,
    @Inject(forwardRef(() => SlotService)) private readonly slots: SlotService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.scan(), SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.waitlistOpenSlot.findMany({
        where: { status: WaitlistOpenSlotStatus.OPEN },
        distinct: ["tenantId"],
        select: { tenantId: true },
      });
      const pending = await this.prisma.waitlistSlotOffer.findMany({
        where: { status: WaitlistOfferStatus.PENDING },
        distinct: ["tenantId"],
        select: { tenantId: true },
      });
      for (const tenantId of new Set([...tenants, ...pending].map((r) => r.tenantId))) {
        await this.processTenant(tenantId).catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
      }
    } finally {
      this.running = false;
    }
  }

  /** Expire stale offers, then offer every open slot to its next candidate. */
  async processTenant(tenantId: string, now: Date = new Date()): Promise<void> {
    const stale = await this.prisma.waitlistSlotOffer.findMany({
      where: { tenantId, status: WaitlistOfferStatus.PENDING, expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const o of stale) await this.closeOffer(o.id, WaitlistOfferStatus.EXPIRED, now);

    const open = await this.prisma.waitlistOpenSlot.findMany({
      where: { tenantId, status: WaitlistOpenSlotStatus.OPEN },
      select: { id: true },
      orderBy: { startsAt: "asc" },
    });
    for (const s of open) await this.offerNext(s.id, now);
  }

  /**
   * Offers the slot to the next eligible waitlisted patient. The DB unique `activeSlotId` guarantees a single
   * PENDING offer per slot even if two workers race here.
   */
  async offerNext(slotId: string, now: Date = new Date()): Promise<{ offerId: string } | null> {
    const slot = await this.prisma.waitlistOpenSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.status !== WaitlistOpenSlotStatus.OPEN) return null;
    if (await this.prisma.waitlistSlotOffer.findUnique({ where: { activeSlotId: slot.id } })) return null;

    const market = await resolveMarketForTenant(this.prisma, slot.tenantId);
    const holdMinutes = waitlistOfferHoldMinutes(market.providerConfig);
    if (slot.startsAt.getTime() <= now.getTime() + holdMinutes * 60_000) {
      await this.closeSlot(slot.id, WaitlistOpenSlotStatus.CLOSED, now);
      return null;
    }
    if (!(await this.featureFlags.isEnabled(slot.tenantId, "whatsapp_reminders"))) return null;
    // clinic.waitlist_autofill OFF: waitlist kept, no automatic offers.
    if (!(await this.featureFlags.isEnabled(slot.tenantId, "clinic.waitlist_autofill"))) return null;
    if (await this.slotTaken(slot)) {
      await this.closeSlot(slot.id, WaitlistOpenSlotStatus.FILLED_ELSEWHERE, now);
      return null;
    }

    const tried = await this.prisma.waitlistSlotOffer.findMany({ where: { slotId: slot.id }, select: { waitlistEntryId: true } });
    const triedIds = new Set(tried.map((t) => t.waitlistEntryId));
    const waiting = await this.prisma.appointmentWaitlistEntry.findMany({
      where: {
        tenantId: slot.tenantId,
        clinicId: slot.clinicId,
        status: AppointmentWaitlistStatus.WAITING,
        OR: [{ clinicianId: slot.clinicianId }, { clinicianId: null }],
      },
      orderBy: { createdAt: "asc" },
      include: { patient: { select: { firstNameEn: true, phone: true, isSample: true } } },
    });
    const candidates = eligibleForSlot(waiting, slot.startsAt).filter((e) => !triedIds.has(e.id));

    for (const entry of candidates) {
      const phone = entry.patient.phone?.trim();
      if (!phone || entry.patient.isSample) {
        await this.recordSkip(slot, entry, now, !phone ? "NO_PHONE" : "SAMPLE_PATIENT");
        continue;
      }
      let offerId: string;
      try {
        offerId = await this.prisma.$transaction(async (tx) => {
          const offer = await tx.waitlistSlotOffer.create({
            data: {
              tenantId: slot.tenantId,
              slotId: slot.id,
              waitlistEntryId: entry.id,
              patientId: entry.patientId,
              activeSlotId: slot.id,
              offeredAt: now,
              expiresAt: new Date(now.getTime() + holdMinutes * 60_000),
            },
          });
          await tx.appointmentWaitlistEntry.update({
            where: { id: entry.id },
            data: { status: AppointmentWaitlistStatus.OFFERED, offeredSlotAt: slot.startsAt },
          });
          return offer.id;
        });
      } catch (e) {
        if (isUniqueViolation(e)) return null;
        throw e;
      }

      try {
        const msg = await this.messaging.queueMessage(slot.tenantId, {
          patientId: entry.patientId,
          channel: MessageChannel.WHATSAPP,
          toPhone: phone,
          templateKey: WAITLIST_OFFER_TEMPLATE_KEY,
          body: `A slot opened on ${await this.formatWhen(slot)}. Reply Accept within ${holdMinutes} min to book it.`,
          variables: {
            name: entry.patient.firstNameEn,
            clinic: await this.clinicName(slot.tenantId, slot.clinicId),
            time: await this.formatWhen(slot),
            minutes: String(holdMinutes),
          },
          metadata: { kind: "waitlist_offer", waitlistOfferId: offerId, slotId: slot.id },
        });
        await this.prisma.waitlistSlotOffer.update({ where: { id: offerId }, data: { outboundMessageId: msg.id } });
      } catch (e) {
        const reason = e instanceof Error ? e.message.slice(0, 200) : "SEND_FAILED";
        await this.closeOffer(offerId, WaitlistOfferStatus.SKIPPED, now, reason);
        continue;
      }
      await this.audit.recordEvent({
        tenantId: slot.tenantId,
        actorId: null,
        clinicId: slot.clinicId,
        action: "WAITLIST_SLOT_OFFERED",
        resource: "WaitlistSlotOffer",
        resourceId: offerId,
        metadata: { slotId: slot.id, waitlistEntryId: entry.id, expiresInMinutes: holdMinutes },
      });
      return { offerId };
    }

    await this.closeSlot(slot.id, WaitlistOpenSlotStatus.EXHAUSTED, now);
    return null;
  }

  /** Accept / Decline button on the offer message. Returns false when the context is not a waitlist offer. */
  async handleReply(
    contextProviderMessageId: string,
    action: Extract<WhatsAppReplyAction, "waitlist_accept" | "waitlist_decline">,
    now: Date = new Date(),
  ): Promise<{ handled: boolean; outcome?: "BOOKED" | "DECLINED" | "UNAVAILABLE"; appointmentId?: string }> {
    const outbound = await this.prisma.outboundMessage.findFirst({
      where: { providerMessageId: contextProviderMessageId },
      select: { metadata: true },
    });
    const meta = (outbound?.metadata ?? {}) as { waitlistOfferId?: unknown };
    const offerId = typeof meta.waitlistOfferId === "string" ? meta.waitlistOfferId : null;
    if (!offerId) return { handled: false };
    const offer = await this.prisma.waitlistSlotOffer.findUnique({ where: { id: offerId }, include: { slot: true } });
    if (!offer) return { handled: false };

    if (action === "waitlist_decline") {
      const closed = await this.closeOffer(offer.id, WaitlistOfferStatus.DECLINED, now);
      if (closed) await this.offerNext(offer.slotId, now);
      return { handled: true, outcome: "DECLINED" };
    }

    const live = offer.status === WaitlistOfferStatus.PENDING && offer.expiresAt.getTime() > now.getTime();
    if (!live || (await this.slotTaken(offer.slot))) {
      if (live) {
        await this.closeOffer(offer.id, WaitlistOfferStatus.WITHDRAWN, now, "SLOT_TAKEN");
        await this.closeSlot(offer.slotId, WaitlistOpenSlotStatus.FILLED_ELSEWHERE, now);
      }
      if (offer.status !== WaitlistOfferStatus.ACCEPTED) await this.notify(offer, WAITLIST_CLOSED_TEMPLATE_KEY);
      return { handled: true, outcome: "UNAVAILABLE" };
    }

    const slot = offer.slot;
    const booked = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.waitlistSlotOffer.updateMany({
        where: { id: offer.id, status: WaitlistOfferStatus.PENDING, expiresAt: { gt: now } },
        data: { status: WaitlistOfferStatus.ACCEPTED, activeSlotId: null, respondedAt: now },
      });
      if (claim.count === 0) return null;
      const apt = await tx.appointment.create({
        data: {
          tenantId: slot.tenantId,
          clinicId: slot.clinicId,
          clinicianId: slot.clinicianId,
          patientId: offer.patientId,
          appointmentTypeId: slot.appointmentTypeId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          feeAmount: slot.feeAmount,
          status: AppointmentStatus.CONFIRMED,
          whatsappConfirmedAt: now,
          bookingSource: BookingSource.FRONT_DESK,
          attributionJson: { source: "waitlist_autofill", waitlistOfferId: offer.id, slotId: slot.id },
        },
      });
      await tx.waitlistSlotOffer.update({ where: { id: offer.id }, data: { bookedAppointmentId: apt.id } });
      await tx.waitlistOpenSlot.update({
        where: { id: slot.id },
        data: { status: WaitlistOpenSlotStatus.FILLED, openKey: null, filledAppointmentId: apt.id, closedAt: now },
      });
      await tx.appointmentWaitlistEntry.update({
        where: { id: offer.waitlistEntryId },
        data: { status: AppointmentWaitlistStatus.BOOKED },
      });
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId: slot.tenantId,
          appointmentId: apt.id,
          clinicId: slot.clinicId,
          previousStatus: AppointmentStatus.SCHEDULED,
          nextStatus: AppointmentStatus.CONFIRMED,
          bookingSource: apt.bookingSource,
          metadata: { source: "waitlist_autofill" },
        },
        tx,
      );
      return apt;
    });
    if (!booked) return { handled: true, outcome: "UNAVAILABLE" };

    await this.slots.invalidateAndNotify(slot.tenantId, slot.clinicId, slot.clinicianId, "waitlist_autofill_booked");
    await this.audit.recordEvent({
      tenantId: slot.tenantId,
      actorId: null,
      clinicId: slot.clinicId,
      action: "WAITLIST_SLOT_BOOKED",
      resource: "Appointment",
      resourceId: booked.id,
      metadata: { waitlistOfferId: offer.id, slotId: slot.id, sourceAppointmentId: slot.sourceAppointmentId },
    });
    await this.notify(offer, WAITLIST_BOOKED_TEMPLATE_KEY);
    return { handled: true, outcome: "BOOKED", appointmentId: booked.id };
  }

  private async closeOffer(offerId: string, status: WaitlistOfferStatus, now: Date, skipReason?: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.waitlistSlotOffer.updateMany({
        where: { id: offerId, status: WaitlistOfferStatus.PENDING },
        data: { status, activeSlotId: null, respondedAt: now, ...(skipReason ? { skipReason } : {}) },
      });
      if (res.count === 0) return false;
      const offer = await tx.waitlistSlotOffer.findUniqueOrThrow({ where: { id: offerId } });
      await tx.appointmentWaitlistEntry.updateMany({
        where: { id: offer.waitlistEntryId, status: AppointmentWaitlistStatus.OFFERED },
        data: { status: AppointmentWaitlistStatus.WAITING, offeredSlotAt: null },
      });
      return true;
    });
  }

  private async closeSlot(slotId: string, status: WaitlistOpenSlotStatus, now: Date): Promise<void> {
    await this.prisma.waitlistOpenSlot.updateMany({
      where: { id: slotId, status: WaitlistOpenSlotStatus.OPEN },
      data: { status, openKey: null, closedAt: now },
    });
  }

  private async recordSkip(
    slot: { id: string; tenantId: string },
    entry: { id: string; patientId: string },
    now: Date,
    reason: string,
  ): Promise<void> {
    await this.prisma.waitlistSlotOffer
      .create({
        data: {
          tenantId: slot.tenantId,
          slotId: slot.id,
          waitlistEntryId: entry.id,
          patientId: entry.patientId,
          status: WaitlistOfferStatus.SKIPPED,
          offeredAt: now,
          expiresAt: now,
          respondedAt: now,
          skipReason: reason,
        },
      })
      .catch((e) => {
        if (!isUniqueViolation(e)) throw e;
      });
  }

  private async slotTaken(slot: { tenantId: string; clinicianId: string; startsAt: Date; endsAt: Date | null }): Promise<boolean> {
    const end = slot.endsAt ?? new Date(slot.startsAt.getTime() + 60_000);
    const clash = await this.prisma.appointment.findFirst({
      where: {
        tenantId: slot.tenantId,
        clinicianId: slot.clinicianId,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        startsAt: { lt: end },
        OR: [{ endsAt: { gt: slot.startsAt } }, { endsAt: null, startsAt: { gte: slot.startsAt } }],
      },
      select: { id: true },
    });
    return Boolean(clash);
  }

  private async notify(offer: { tenantId: string; patientId: string; slotId: string }, templateKey: string): Promise<void> {
    const [patient, slot] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: offer.patientId, tenantId: offer.tenantId }, select: { phone: true, firstNameEn: true } }),
      this.prisma.waitlistOpenSlot.findUnique({ where: { id: offer.slotId } }),
    ]);
    if (!patient?.phone || !slot) return;
    const time = await this.formatWhen(slot);
    await this.messaging
      .queueMessage(offer.tenantId, {
        patientId: offer.patientId,
        channel: MessageChannel.WHATSAPP,
        toPhone: patient.phone,
        templateKey,
        body:
          templateKey === WAITLIST_BOOKED_TEMPLATE_KEY
            ? `You're booked for ${time}.`
            : `Sorry, the ${time} slot is no longer available. You are still on the waitlist.`,
        variables: { name: patient.firstNameEn, clinic: await this.clinicName(slot.tenantId, slot.clinicId), time },
        metadata: { kind: templateKey, slotId: slot.id },
      })
      .catch((e) => this.log.warn(`waitlist notify suppressed: ${e instanceof Error ? e.message : String(e)}`));
  }

  private async clinicName(tenantId: string, clinicId: string): Promise<string> {
    const c = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { nameEn: true } });
    return c?.nameEn ?? "";
  }

  private async formatWhen(slot: { tenantId: string; clinicId: string; startsAt: Date }): Promise<string> {
    const [clinic, tenant, market] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: slot.clinicId, tenantId: slot.tenantId }, select: { timezone: true } }),
      this.prisma.tenant.findUnique({ where: { id: slot.tenantId }, select: { defaultLocale: true } }),
      resolveMarketForTenant(this.prisma, slot.tenantId),
    ]);
    const timeZone = clinic?.timezone?.trim() || market.timezone;
    return slot.startsAt.toLocaleString(tenant?.defaultLocale || "en", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
