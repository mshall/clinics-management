import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AcquisitionOrigin,
  AppointmentStatus,
  BookingSource,
  MessageChannel,
  Prisma,
} from "@prisma/client";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import { CONSENT_PURPOSE_MARKETPLACE } from "../compliance/consent-policy.constants";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseAcquisitionBlock, type AcquisitionBlock } from "../growth/acquisition-contract";
import { PromotionBudgetService } from "../promotions/promotion-budget.service";
import { parseSponsoredDiscountBlock } from "../promotions/promotion-commands";
import { careTypeOfServiceLocation } from "../promotions/promotion-eligibility";
import { ProviderLinkCoreService } from "../growth/provider-links/provider-link-core.service";
import { DEFAULT_COMMERCIAL_CONFIG } from "../markets/commercial-config.schema";
import { mapEffectiveAppointmentType } from "../scheduling/appointment-type-rules";
import { appointmentIntervalsOverlap } from "../common/appointment-scheduling";
import { MESSAGING_CONSENT_TRANSACTIONAL } from "../patients/messaging-consent.constants";
import { SlotService } from "../scheduling/slot.service";
import { SLOT_CHANNEL } from "../scheduling/slot-channel";
import { addMinutes, effectiveAppointmentEnd } from "../common/appointment-scheduling";
import { defaultSlotHoldMinutes, MARKETPLACE_BOOKING_CONFIRM_TIMEOUT_TOPIC, SLOT_TAKEN_CODE } from "./marketplace-booking.constants";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplacePatientIntakeService, type MarketplacePatientInput } from "./marketplace-patient-intake.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { NewPatientService } from "../patients/new-patient.service";
import { assertBookingSlugMatchesClinic, CLINIC_LINK_CHANNEL } from "./clinic-booking-page.service";

export const KIOREX_WHATSAPP_CHANNEL = "KIOREX_WHATSAPP" as const;
import { CANCELLATION_REASON_MAX } from "../appointments/kiorex-clinic-cancel";
import {
  CANCELLED_BY,
  evaluatePatientCancel,
  evaluatePatientReschedule,
  hoursUntil,
  resolveKiorexCancellationPolicy,
} from "./kiorex-booking-policy";
import { PushService } from "../push/push.service";
import { encryptVisitAddress } from "../home-visits/address-crypto";
import { HomeVisitRuleException, OutOfCoverageException } from "../home-visits/home-visit.errors";
import { HomeVisitService } from "../home-visits/home-visit.service";
import { parseVisitAddress, VisitAddressError, type VisitAddress } from "../home-visits/visit-address";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { assertTelehealthBookable } from "../telehealth/telehealth-availability";
import { telehealthBlock } from "../telehealth/telehealth-events";
import { ensureTelehealthSession, syncTelehealthWithAppointment } from "../telehealth/telehealth-sync";

export type MarketplaceBookingBody = {
  clinicId: string;
  clinicianId: string;
  typeId: string;
  /** Founder decision A: the market Kiorex resolved for the provider; a different one than the organisation's own is refused (409 CROSS_MARKET_BOOKING). */
  market?: string;
  startsAt: string;
  endsAt?: string;
  holdId?: string;
  holdExternalRef?: string;
  patient: MarketplacePatientInput;
  notes?: string;
  marketplaceConsentGranted?: boolean;
  remindersConsentGranted?: boolean;
  attribution?: Record<string, unknown>;
  /** KX-09: bookings made from the clinic's own booking page are CLINIC_LINK (never commissioned). */
  channel?: typeof CLINIC_LINK_CHANNEL | "MARKETPLACE" | typeof KIOREX_WHATSAPP_CHANNEL;
  bookingPageSlug?: string;
  /** KX-09 §03 — HOME visit types: the address normally travels on the hold; sending it here too is accepted. */
  visitAddress?: unknown;
  serviceLocation?: string;
  /** GRW-P1-D2 (contracts 1.10.0): Kiorex attribution evidence, covered by the request HMAC. Absent = UNATTRIBUTED (today's rules). Validated, stored, never recomputed. */
  acquisition?: unknown;
  /** GRW-P1-D1: signed provider-link touch carried by the public page / widget; a valid one makes the booking provider-led. */
  lt?: string;
  /** GRW-P2-S (contracts 1.12.0): optional block naming the reservation Kiorex holds for a provider-sponsored discount. The booking is never refused because of it. */
  sponsoredDiscount?: unknown;
};

@Injectable()
export class MarketplaceBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MarketplaceAccessService,
    private readonly patients: MarketplacePatientIntakeService,
    private readonly appointments: AppointmentsService,
    private readonly consent: ConsentPolicyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxEventService,
    private readonly appointmentOutbox: AppointmentOutboxService,
    private readonly slots: SlotService,
    private readonly newPatients: NewPatientService,
    private readonly push: PushService,
    @Optional() private readonly homeVisits?: HomeVisitService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly entitlements?: EntitlementsService,
    /** GRW-P1-D1/D2: provider-link verification and counters. Optional so older constructions keep working (no link attribution without it). */
    @Optional() private readonly providerLinks?: ProviderLinkCoreService,
    /** GRW-P2-S: provider-sponsored discount reservations (confirmed after the booking commits, never inside it). */
    @Optional() private readonly promotions?: PromotionBudgetService,
  ) {}

  async getByExternalRef(client: PlatformIntegrationPrincipal, externalRef: string) {
    const row = await this.prisma.appointment.findFirst({
      where: {
        platformIntegrationClientId: client.id,
        externalReference: externalRef.trim(),
      },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
      },
    });
    if (!row) throw new NotFoundException("Booking not found");
    return this.serializeBooking(row);
  }

  async createBooking(
    client: PlatformIntegrationPrincipal,
    idempotencyKey: string,
    body: MarketplaceBookingBody,
  ) {
    const key = idempotencyKey?.trim() || "";
    if (!key) throw new BadRequestException("Idempotency-Key header is required");

    const existing = await this.prisma.appointment.findFirst({
      where: { platformIntegrationClientId: client.id, externalReference: key },
    });
    if (existing) {
      return { ...(await this.serializeBooking(existing)), ...(await this.sponsoredAnswer(existing.id, body.sponsoredDiscount)) };
    }
    const sponsoredBlock = parseSponsoredDiscountBlock(body.sponsoredDiscount); // a malformed block is a contract violation (400); a stale or unusable reservation is not (the booking goes on without the discount)

    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    await this.access.assertListingBookable(body.clinicId, body.clinicianId);
    await this.access.assertSameMarket(tenantId, (body as { market?: unknown }).market);
    // GRW-GC-2 (G-9, contracts 1.12.0): KIOREX_WHATSAPP is accepted; it is commissioned like MARKETPLACE (isCommissionChargeableBooking) unless PROVIDER_LED evidence applies.
    if (body.channel !== undefined && body.channel !== CLINIC_LINK_CHANNEL && body.channel !== "MARKETPLACE" && body.channel !== KIOREX_WHATSAPP_CHANNEL) {
      throw new BadRequestException("Invalid channel");
    }
    const viaClinicLink = body.channel === CLINIC_LINK_CHANNEL;
    if (viaClinicLink) {
      await assertBookingSlugMatchesClinic(this.prisma, body.bookingPageSlug, body.clinicId, body.clinicianId);
    }
    const bookingSource = viaClinicLink ? BookingSource.CLINIC_LINK : body.channel === KIOREX_WHATSAPP_CHANNEL ? BookingSource.KIOREX_WHATSAPP : BookingSource.KIOREX_MARKETPLACE;
    // GRW-P1-D2: the optional signed `acquisition` block. A malformed block is rejected with the contract's error code; an absent one is UNATTRIBUTED (today's rules).
    let block: AcquisitionBlock | null = null;
    if (body.acquisition !== undefined && body.acquisition !== null) {
      const parsed = parseAcquisitionBlock(body.acquisition);
      if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: parsed.message });
      block = parsed.block;
    }
    // GRW-P1-D1: a valid, unexpired `lt` of an ACTIVE link of THIS organisation, or the clinic's own booking page channel, makes the booking provider-led.
    // Evidence only ever REMOVES a fee: the stored origin can move to PROVIDER_LED here, never away from it.
    const link = await this.providerLinks?.verifyForBooking(body.lt, tenantId);
    const providerLed = Boolean(link) || viaClinicLink || block?.origin === AcquisitionOrigin.PROVIDER_LED;
    const acquisitionOrigin: AcquisitionOrigin = providerLed ? AcquisitionOrigin.PROVIDER_LED : block?.origin ?? AcquisitionOrigin.UNATTRIBUTED;
    const acquisitionDecisionRef = block?.decisionId ?? (link ? `link:${link.code}` : viaClinicLink ? "clinic-link" : null);
    const acquisitionPolicyVersion = block?.policyVersion ?? (link ? "LINK_TOUCH_V1" : viaClinicLink ? "CLINIC_LINK_V1" : null);
    const attributionBase = {
      ...(viaClinicLink && body.bookingPageSlug ? { ...(body.attribution ?? {}), bookingPageSlug: body.bookingPageSlug.trim().toLowerCase() } : body.attribution ?? {}),
      ...(link ? { referralLinkCode: link.code } : {}),
      ...(block ? { acquisition: { reason: block.reason, evidenceHash: block.evidenceHash, ...(block.touch ? { touch: block.touch } : {}) } } : {}),
    };
    const attribution = Object.keys(attributionBase).length ? attributionBase : body.attribution;
    const start = new Date(body.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    const typeRow = await this.prisma.appointmentType.findFirst({
      where: { id: body.typeId, tenantId, clinicId: body.clinicId, isActive: true, marketplaceBookable: true },
    });
    if (!typeRow) throw new BadRequestException("Invalid marketplace appointment type");
    const override = await this.prisma.clinicianAppointmentTypeOverride.findFirst({
      where: { tenantId, clinicianId: body.clinicianId, appointmentTypeId: body.typeId },
    });
    const effective = mapEffectiveAppointmentType(typeRow, override);
    const end = body.endsAt ? new Date(body.endsAt) : addMinutes(start, effective.durationMinutes);
    if (Number.isNaN(end.getTime()) || end <= start) throw new BadRequestException("Invalid endsAt");

    const clinic = await this.prisma.clinic.findFirst({
      where: { id: body.clinicId, tenantId },
      select: { marketplaceBookingAutoConfirm: true },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");

    const patientId = await this.patients.resolveOrCreate(tenantId, body.clinicId, body.patient);
    const newPatientStamp = await this.newPatients.stampNewPatientAtBooking(tenantId, patientId, start);

    if (body.marketplaceConsentGranted !== false) {
      await this.consent.capture(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE, {
        granted: true,
        source: "kiorex_booking",
      });
    }
    await this.consent.require(tenantId, patientId, CONSENT_PURPOSE_MARKETPLACE);

    if (body.remindersConsentGranted) {
      await this.prisma.messagingConsent.upsert({
        where: {
          patientId_channel_purpose: {
            patientId,
            channel: MessageChannel.WHATSAPP,
            purpose: MESSAGING_CONSENT_TRANSACTIONAL,
          },
        },
        create: {
          tenantId,
          patientId,
          channel: MessageChannel.WHATSAPP,
          purpose: MESSAGING_CONSENT_TRANSACTIONAL,
          granted: true,
          source: "kiorex_booking",
        },
        update: { granted: true, source: "kiorex_booking" },
      });
    }

    // ADR-039: a telehealth type needs flag + entitlement + a doctor who offers it; the Appointment and its session are created in ONE transaction.
    const isVideo = typeRow.serviceLocation === "VIDEO";
    if (isVideo) {
      await assertTelehealthBookable({ prisma: this.prisma as never, flags: this.flags, entitlements: this.entitlements }, tenantId, body.clinicianId);
    }

    // HVBK01/03 + HVSAF03: HOME visit types need an in-zone address (from the hold, or sent here) and pass every booking rule.
    const isHome = typeRow.serviceLocation === "HOME";
    let home: { address: VisitAddress; ciphertext: string } | null = null;
    if (isHome) {
      if (!this.homeVisits) throw new BadRequestException("Home visits are not available");
      const holdRow = body.holdId
        ? await this.prisma.slotHold.findFirst({ where: { id: body.holdId, platformIntegrationClientId: client.id } })
        : body.holdExternalRef
          ? await this.prisma.slotHold.findFirst({ where: { externalRef: body.holdExternalRef.trim(), platformIntegrationClientId: client.id } })
          : null;
      let address: VisitAddress;
      let ciphertext: string;
      try {
        if (body.visitAddress != null) {
          address = parseVisitAddress(body.visitAddress, { requireLine1: true });
          ciphertext = encryptVisitAddress(address, tenantId);
        } else if (holdRow?.visitAddressCiphertext && holdRow.visitDistrict) {
          address = { district: holdRow.visitDistrict };
          ciphertext = holdRow.visitAddressCiphertext;
        } else {
          throw new VisitAddressError("VISIT_ADDRESS_REQUIRED", "visitAddress is required for HOME visit types");
        }
      } catch (e) {
        if (e instanceof VisitAddressError) throw new HomeVisitRuleException(e.code, e.message);
        throw e;
      }
      const patientRow = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true, gender: true } });
      try {
        await this.homeVisits.assertBookable({
          tenantId,
          clinicId: body.clinicId,
          clinicianId: body.clinicianId,
          type: typeRow,
          startsAt: start,
          endsAt: end,
          address,
          patient: patientRow,
          source: viaClinicLink ? "FRONT_DESK" : "KIOREX",
        });
      } catch (e) {
        // KX-09 §08: zone changed after the hold -> release the hold; Kiorex shows in-zone alternatives.
        if (e instanceof OutOfCoverageException && holdRow) {
          await this.prisma.slotHold.delete({ where: { id: holdRow.id } }).catch(() => undefined);
          await this.slots.invalidateAndNotify(tenantId, body.clinicId, body.clinicianId, "slot_hold_released");
        }
        throw e;
      }
      home = { address, ciphertext };
    }

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
        const lockKey = BigInt(Math.abs(body.clinicianId.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + start.getTime()));
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        const now = new Date();
        await tx.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });

        const hold = body.holdId
          ? await tx.slotHold.findFirst({
              where: {
                id: body.holdId,
                platformIntegrationClientId: client.id,
                expiresAt: { gt: now },
              },
            })
          : body.holdExternalRef
            ? await tx.slotHold.findFirst({
                where: {
                  externalRef: body.holdExternalRef.trim(),
                  platformIntegrationClientId: client.id,
                  expiresAt: { gt: now },
                },
              })
            : null;

        if (hold && (hold.startsAt.getTime() !== start.getTime() || hold.clinicianId !== body.clinicianId)) {
          throw new BadRequestException("Hold does not match booking slot");
        }

        // Daily marketplace cap on the write path (a booking without a hold never touched the slot list). A held slot already counts, so exclude it.
        await this.slots.lockMarketplaceDay(tx, tenantId, body.clinicId, body.clinicianId, start);
        await this.slots.assertMarketplaceDailyCapRoom(tx, { tenantId, clinicId: body.clinicId, clinicianId: body.clinicianId, startsAt: start, excludeHoldId: hold?.id });

        const sameDay = await tx.appointment.findMany({
          where: {
            tenantId,
            clinicianId: body.clinicianId,
            status: { notIn: [AppointmentStatus.CANCELLED] },
            startsAt: { gte: addMinutes(start, -24 * 60), lte: addMinutes(end, 24 * 60) },
          },
        });
        const conflicting = sameDay.find((a) =>
          appointmentIntervalsOverlap(
            start,
            end,
            a.startsAt,
            effectiveAppointmentEnd(a.startsAt, a.endsAt),
          ),
        );
        const conflictingHold = await tx.slotHold.findFirst({
          where: {
            clinicianId: body.clinicianId,
            startsAt: start,
            expiresAt: { gt: now },
            ...(hold ? { NOT: { id: hold.id } } : {}),
          },
        });
        if (conflicting || conflictingHold) {
          throw new ConflictException({ code: SLOT_TAKEN_CODE, message: "Slot already taken" });
        }

        const confirmHours = DEFAULT_COMMERCIAL_CONFIG.kiorex.autoConfirmHours;
        const autoConfirm = clinic.marketplaceBookingAutoConfirm;
        const status = autoConfirm ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED;
        const confirmationDueAt = autoConfirm
          ? null
          : addMinutes(new Date(), confirmHours * 60);

        const appt = await tx.appointment.create({
          data: {
            tenantId,
            clinicId: body.clinicId,
            patientId,
            clinicianId: body.clinicianId,
            appointmentTypeId: body.typeId,
            startsAt: start,
            endsAt: end,
            feeAmount: typeRow.feeAmount,
            // BR56: the home surcharge is its own field; it never enters feeAmount (the base commission / revenue-share fee).
            ...(isHome ? { serviceLocation: "HOME" as const, homeSurchargeAmount: typeRow.homeSurchargeAmount } : {}),
            ...(isVideo ? { serviceLocation: "VIDEO" as const } : {}),
            status,
            bookingSource,
            attributionJson: (attribution ?? undefined) as Prisma.InputJsonValue | undefined,
            // frozen at booking (D2): later Kiorex decisions never change these; only an approved PROVIDER_LED_EVIDENCE dispute may flip the origin, to PROVIDER_LED
            acquisitionOrigin,
            acquisitionDecisionRef,
            acquisitionPolicyVersion,
            isNewPatientAtBooking: newPatientStamp.isNewPatientAtBooking,
            newPatientCheckedAt: newPatientStamp.newPatientCheckedAt,
            platformIntegrationClientId: client.id,
            externalReference: key,
            marketplaceConfirmationDueAt: confirmationDueAt,
            notes: body.notes ?? null,
          },
        });

        if (hold) await tx.slotHold.delete({ where: { id: hold.id } });
        if (link) await this.providerLinks!.countBooking(tx, link);
        if (isVideo) await ensureTelehealthSession(tx, appt, null);

        if (home && this.homeVisits) {
          await this.homeVisits.createForAppointment(tx, {
            tenantId,
            clinicId: body.clinicId,
            appointmentId: appt.id,
            patientId,
            clinicianId: body.clinicianId,
            startsAt: start,
            endsAt: end,
            address: home.address,
            addressCiphertext: home.ciphertext,
            addressConfirmed: true, // the patient entered it in Kiorex
            appointmentConfirmed: status === AppointmentStatus.CONFIRMED,
            surcharge: typeRow.homeSurchargeAmount ? Number(typeRow.homeSurchargeAmount) : null,
          });
        }

        if (status === AppointmentStatus.CONFIRMED) {
          await this.appointmentOutbox.emitStatusChange(
            {
              tenantId,
              appointmentId: appt.id,
              clinicId: appt.clinicId,
              previousStatus: AppointmentStatus.SCHEDULED,
              nextStatus: status,
              bookingSource: appt.bookingSource,
            },
            tx,
          );
        }

        return appt;
      },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.slots.invalidateAndNotify(tenantId, body.clinicId, body.clinicianId, "marketplace_booking");
      await this.audit.recordEvent({
        tenantId,
        actorId: null,
        clinicId: body.clinicId,
        action: "marketplace.booking.created",
        resource: "Appointment",
        resourceId: created.id,
        metadata: { externalReference: key, platformClientId: client.id, bookingSource },
      });

      // UX-01: web push to the clinician (best-effort; never fails the booking).
      void this.push
        .notifyKiorexBooking({
          tenantId,
          clinicianUserId: body.clinicianId,
          appointmentId: created.id,
          externalRef: key,
          startsAt: created.startsAt,
          clinicId: body.clinicId,
        })
        .catch(() => undefined);

      const sponsored = sponsoredBlock && this.promotions ? await this.confirmSponsored(tenantId, created, key, sponsoredBlock, { patientId, newPatientStamp, careType: careTypeOfServiceLocation(typeRow.serviceLocation), bookingSource, start }) : sponsoredBlock ? { sponsoredDiscount: { applied: false, promotionId: sponsoredBlock.promotionId, reservationRef: sponsoredBlock.reservationRef, reason: "PROMOTIONS_UNAVAILABLE" } } : {};
      return { ...(await this.serializeBooking(created)), ...sponsored };
    } catch (e) {
      if (e instanceof ConflictException && (e.getResponse() as { code?: string })?.code === SLOT_TAKEN_CODE) {
        const alternatives = await this.nearestAlternatives(tenantId, body);
        throw new ConflictException({
          code: SLOT_TAKEN_CODE,
          message: "Slot already taken",
          alternatives,
        });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034")) {
        const again = await this.prisma.appointment.findFirst({
          where: { platformIntegrationClientId: client.id, externalReference: key },
        });
        if (again) return this.serializeBooking(again);
        // P2034 = serializable write conflict: a parallel booking for the same slot won the race (GRW-P1-D2 concurrency test). Same answer as SLOT_TAKEN, with alternatives, so Kiorex can retry.
        if (e.code === "P2034") {
          throw new ConflictException({ code: SLOT_TAKEN_CODE, message: "Slot already taken", alternatives: await this.nearestAlternatives(tenantId, body) });
        }
      }
      throw e;
    }
  }

  /**
   * GRW-P2-S: after the booking has committed, confirm the reservation Kiorex holds for a provider-sponsored discount. Own transaction, never throws: a failure leaves the reservation RESERVED
   * (the sweeper releases it) and the answer says the discount did not apply, so Kiorex charges the full deposit. The booking itself is never refused or rolled back because of a promotion.
   */
  private async confirmSponsored(
    tenantId: string,
    appt: { id: string; startsAt: Date; feeAmount: Prisma.Decimal | number | string },
    bookingRef: string,
    block: NonNullable<ReturnType<typeof parseSponsoredDiscountBlock>>,
    ctx: { patientId: string; newPatientStamp: { isNewPatientAtBooking: boolean | null }; careType: ReturnType<typeof careTypeOfServiceLocation>; bookingSource: BookingSource; start: Date },
  ) {
    try {
      const patient = await this.prisma.patient.findUnique({ where: { id: ctx.patientId }, select: { phone: true } });
      const kiorexBefore = await this.prisma.appointment.count({ where: { tenantId, patientId: ctx.patientId, id: { not: appt.id }, bookingSource: { in: [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP] }, status: { not: AppointmentStatus.CANCELLED } } });
      const full = await this.prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { clinicianId: true, appointmentTypeId: true } });
      const r = await this.prisma.$transaction((tx) => this.promotions!.confirmForBooking(tx, tenantId, {
        promotionId: block.promotionId, promotionVersion: block.promotionVersion, reservationRef: block.reservationRef, amountMinor: block.amountMinor, currency: block.currency, bookingRef, appointmentId: appt.id,
        facts: { doctorId: full.clinicianId, appointmentTypeId: full.appointmentTypeId ?? "", careType: ctx.careType, startsAt: ctx.start, isNewToClinic: Boolean(ctx.newPatientStamp.isNewPatientAtBooking), kiorexBookingsBefore: kiorexBefore, channelIsKiorex: ctx.bookingSource === BookingSource.KIOREX_MARKETPLACE || ctx.bookingSource === BookingSource.KIOREX_WHATSAPP, visitFeeMinor: Math.round(Number(appt.feeAmount) * 100) },
        patientPhone: patient?.phone ?? null,
      }));
      return { sponsoredDiscount: { applied: r.applied, promotionId: block.promotionId, reservationRef: block.reservationRef, ...(r.applied ? { amountMinor: r.amountMinor, currency: block.currency } : { reason: r.reason }) } };
    } catch (e) {
      return { sponsoredDiscount: { applied: false, promotionId: block.promotionId, reservationRef: block.reservationRef, reason: "CONFIRMATION_FAILED" } };
    }
  }

  /** The answer of a replayed booking call: what became of the reservation (read only). */
  private async sponsoredAnswer(appointmentId: string, raw: unknown) {
    const block = (() => { try { return parseSponsoredDiscountBlock(raw); } catch { return null; } })();
    if (!block) return {};
    const r = await this.prisma.promotionReservation.findUnique({ where: { reservationRef: block.reservationRef } });
    const applied = !!r && r.appointmentId === appointmentId && (r.state === "BOOKED" || r.state === "DEBITED");
    return { sponsoredDiscount: { applied, promotionId: block.promotionId, reservationRef: block.reservationRef, ...(applied ? { amountMinor: r!.amountMinor, currency: r!.currency } : { reason: r ? `RESERVATION_${r.state}` : "RESERVATION_NOT_FOUND" }) } };
  }

  async loadCancellationPolicy(tenantId: string, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: { kiorexCancellationPolicy: true, tenant: { select: { market: { select: { commercialConfig: true } } } } },
    });
    if (!clinic) throw new NotFoundException("Clinic not found");
    return resolveKiorexCancellationPolicy(clinic.tenant.market?.commercialConfig, clinic.kiorexCancellationPolicy);
  }

  private async findOwnBooking(client: PlatformIntegrationPrincipal, externalRef: string) {
    const row = await this.prisma.appointment.findFirst({
      where: { platformIntegrationClientId: client.id, externalReference: externalRef.trim() },
    });
    if (!row) throw new NotFoundException("Booking not found");
    return row;
  }

  /** KX-06: patient cancels via Kiorex — enforced against the clinic policy; deposit refund decided server-side. */
  async cancelByPatient(
    client: PlatformIntegrationPrincipal,
    externalRef: string,
    body: { reason?: string } = {},
    now = new Date(),
  ) {
    const appt = await this.findOwnBooking(client, externalRef);
    if (appt.status === AppointmentStatus.CANCELLED && appt.cancelledBy === CANCELLED_BY.PATIENT) {
      return this.serializeBooking(appt);
    }
    const policy = await this.loadCancellationPolicy(appt.tenantId, appt.clinicId);
    const decision = evaluatePatientCancel(policy, appt, now);
    if (!decision.allowed) {
      await this.auditPolicyRejection(appt, "marketplace.booking.cancel_rejected", decision.code);
      throw new UnprocessableEntityException({ code: decision.code, message: "Cancellation not allowed by clinic policy", policy });
    }
    const reason = body.reason?.trim().slice(0, CANCELLATION_REASON_MAX) || null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id: appt.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: CANCELLED_BY.PATIENT,
          cancellationReason: reason,
          depositRefundable: decision.depositRefundable,
          marketplaceConfirmationDueAt: null,
        },
      });
      await syncTelehealthWithAppointment(tx, row, appt, null);
      await this.appointmentOutbox.emitStatusChange(
        {
          tenantId: row.tenantId,
          appointmentId: row.id,
          clinicId: row.clinicId,
          previousStatus: appt.status,
          nextStatus: AppointmentStatus.CANCELLED,
          bookingSource: row.bookingSource,
          cancelledByPatient: true,
          metadata: {
            externalReference: row.externalReference,
            cancelledBy: CANCELLED_BY.PATIENT,
            cancellationReason: reason,
            depositRefundable: decision.depositRefundable,
          },
        },
        tx,
      );
      return row;
    });
    await this.slots.invalidateAndNotify(updated.tenantId, updated.clinicId, updated.clinicianId, "marketplace_cancel");
    await this.audit.recordEvent({
      tenantId: updated.tenantId,
      actorId: null,
      clinicId: updated.clinicId,
      action: "marketplace.booking.cancelled_by_patient",
      resource: "Appointment",
      resourceId: updated.id,
      metadata: {
        externalReference: updated.externalReference,
        reason,
        depositRefundable: decision.depositRefundable,
        hoursBeforeStart: Math.round(hoursUntil(appt.startsAt, now) * 10) / 10,
      },
    });
    return this.serializeBooking(updated);
  }

  /** KX-06: patient moves a Kiorex booking to another free slot, within the clinic's reschedule window. */
  async rescheduleByPatient(
    client: PlatformIntegrationPrincipal,
    externalRef: string,
    body: { startsAt: string; endsAt?: string; holdId?: string },
    now = new Date(),
  ) {
    const appt = await this.findOwnBooking(client, externalRef);
    const policy = await this.loadCancellationPolicy(appt.tenantId, appt.clinicId);
    const decision = evaluatePatientReschedule(policy, appt, now);
    if (!decision.allowed) {
      await this.auditPolicyRejection(appt, "marketplace.booking.reschedule_rejected", decision.code);
      throw new UnprocessableEntityException({ code: decision.code, message: "Reschedule not allowed by clinic policy", policy });
    }
    const start = new Date(body.startsAt);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");
    if (start.getTime() === appt.startsAt.getTime()) return this.serializeBooking(appt);
    await this.access.assertListingBookable(appt.clinicId, appt.clinicianId);
    const typeRow = appt.appointmentTypeId
      ? await this.prisma.appointmentType.findFirst({ where: { id: appt.appointmentTypeId, tenantId: appt.tenantId } })
      : null;
    const durationMin = appt.endsAt
      ? Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000)
      : (typeRow?.durationMinutes ?? 15);
    const end = body.endsAt ? new Date(body.endsAt) : addMinutes(start, durationMin);
    if (Number.isNaN(end.getTime()) || end <= start) throw new BadRequestException("Invalid endsAt");
    if (typeRow) {
      if (start.getTime() < now.getTime() + typeRow.minNoticeMinutes * 60_000) {
        throw new BadRequestException({ code: "MIN_NOTICE", message: "New slot is inside the minimum notice window" });
      }
      if (start.getTime() > now.getTime() + typeRow.maxDaysAhead * 86_400_000) {
        throw new BadRequestException({ code: "BEYOND_HORIZON", message: "New slot is beyond the booking horizon" });
      }
    }

    // Two patients moving onto the same slot at once: the Serializable snapshot of the loser predates the winner's commit, so PostgreSQL aborts it (P2034 / 40001).
    // That is the same answer as an ordinary conflict (409 SLOT_TAKEN with alternatives), never a 500 (EDGE-41).
    const slotTaken = async () =>
      new ConflictException({
        code: SLOT_TAKEN_CODE,
        message: "Slot already taken",
        alternatives: await this.nearestAlternatives(appt.tenantId, {
          clinicId: appt.clinicId,
          clinicianId: appt.clinicianId,
          typeId: appt.appointmentTypeId ?? undefined,
          startsAt: start.toISOString(),
        } as MarketplaceBookingBody),
      });
    let updated;
    try {
      updated = await this.prisma.$transaction(
      async (tx) => {
        const lockKey = BigInt(Math.abs(appt.clinicianId.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + start.getTime()));
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        const hold = body.holdId
          ? await tx.slotHold.findFirst({
              where: { id: body.holdId, platformIntegrationClientId: client.id, expiresAt: { gt: now } },
            })
          : null;
        if (hold && (hold.startsAt.getTime() !== start.getTime() || hold.clinicianId !== appt.clinicianId)) {
          throw new BadRequestException("Hold does not match booking slot");
        }
        await this.slots.lockMarketplaceDay(tx, appt.tenantId, appt.clinicId, appt.clinicianId, start);
        await this.slots.assertMarketplaceDailyCapRoom(tx, { tenantId: appt.tenantId, clinicId: appt.clinicId, clinicianId: appt.clinicianId, startsAt: start, excludeHoldId: hold?.id, excludeAppointmentId: appt.id });
        const nearby = await tx.appointment.findMany({
          where: {
            tenantId: appt.tenantId,
            clinicianId: appt.clinicianId,
            id: { not: appt.id },
            status: { notIn: [AppointmentStatus.CANCELLED] },
            startsAt: { gte: addMinutes(start, -24 * 60), lte: addMinutes(end, 24 * 60) },
          },
        });
        const conflicting = nearby.some((a) =>
          appointmentIntervalsOverlap(start, end, a.startsAt, effectiveAppointmentEnd(a.startsAt, a.endsAt)),
        );
        const conflictingHold = await tx.slotHold.findFirst({
          where: {
            clinicianId: appt.clinicianId,
            startsAt: start,
            expiresAt: { gt: now },
            ...(hold ? { NOT: { id: hold.id } } : {}),
          },
        });
        if (conflicting || conflictingHold) {
          throw new ConflictException({ code: SLOT_TAKEN_CODE, message: "Slot already taken" });
        }
        const row = await tx.appointment.update({
          where: { id: appt.id },
          data: { startsAt: start, endsAt: end, rescheduleCount: { increment: 1 } },
        });
        if (hold) await tx.slotHold.delete({ where: { id: hold.id } });
        await this.appointmentOutbox.emitRescheduled(row.tenantId, row.id, row.clinicId, start.toISOString(), tx);
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (e instanceof ConflictException && (e.getResponse() as { code?: string })?.code === SLOT_TAKEN_CODE) throw await slotTaken();
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") throw await slotTaken();
      throw e;
    }
    await this.slots.invalidateAndNotify(updated.tenantId, updated.clinicId, updated.clinicianId, "marketplace_reschedule");
    await this.audit.recordEvent({
      tenantId: updated.tenantId,
      actorId: null,
      clinicId: updated.clinicId,
      action: "marketplace.booking.rescheduled_by_patient",
      resource: "Appointment",
      resourceId: updated.id,
      metadata: {
        externalReference: updated.externalReference,
        fromStartsAt: appt.startsAt.toISOString(),
        toStartsAt: start.toISOString(),
        rescheduleCount: updated.rescheduleCount,
      },
    });
    return this.serializeBooking(updated);
  }

  private async auditPolicyRejection(
    appt: { id: string; tenantId: string; clinicId: string; externalReference: string | null },
    action: string,
    code: string,
  ) {
    await this.audit.recordEvent({
      tenantId: appt.tenantId,
      actorId: null,
      clinicId: appt.clinicId,
      action,
      resource: "Appointment",
      resourceId: appt.id,
      metadata: { externalReference: appt.externalReference, code },
    });
  }

  async processConfirmationTimeouts(batch = 50): Promise<number> {
    const now = new Date();
    const rows = await this.prisma.appointment.findMany({
      where: {
        bookingSource: { in: [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP, BookingSource.CLINIC_LINK] },
        status: AppointmentStatus.SCHEDULED,
        marketplaceConfirmationDueAt: { lte: now },
      },
      take: batch,
      select: {
        id: true,
        tenantId: true,
        clinicId: true,
        externalReference: true,
        platformIntegrationClientId: true,
      },
    });
    for (const row of rows) {
      await this.prisma.telehealthSession.updateMany({ where: { appointmentId: row.id, status: { notIn: ["ENDED", "CANCELLED"] } }, data: { status: "CANCELLED", endReason: "CANCELLED", endedAt: now } });
      await this.prisma.appointment.update({
        where: { id: row.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          marketplaceConfirmationDueAt: null,
          cancelledAt: now,
          cancelledBy: CANCELLED_BY.SYSTEM,
          depositRefundable: true,
        },
      });
      await this.outbox.enqueue(row.tenantId, MARKETPLACE_BOOKING_CONFIRM_TIMEOUT_TOPIC, {
        appointmentId: row.id,
        clinicId: row.clinicId,
        externalReference: row.externalReference,
        platformIntegrationClientId: row.platformIntegrationClientId,
      });
    }
    return rows.length;
  }

  private async nearestAlternatives(tenantId: string, body: MarketplaceBookingBody) {
    const target = new Date(body.startsAt).getTime();
    const from = addMinutes(new Date(body.startsAt), -12 * 60);
    const to = addMinutes(new Date(body.startsAt), 14 * 24 * 60);
    const { slots } = await this.slots.getSlots({
      tenantId,
      clinicId: body.clinicId,
      clinicianId: body.clinicianId,
      typeId: body.typeId,
      from,
      to,
      channel: SLOT_CHANNEL.MARKETPLACE,
    });
    return [...slots]
      .sort((a, b) => Math.abs(new Date(a.startsAt).getTime() - target) - Math.abs(new Date(b.startsAt).getTime() - target))
      .slice(0, 3);
  }

  private async serializeBooking(row: {
    id: string;
    clinicId: string;
    clinicianId: string;
    patientId: string;
    appointmentTypeId: string | null;
    startsAt: Date;
    endsAt: Date | null;
    status: AppointmentStatus;
    externalReference: string | null;
    bookingSource: BookingSource;
    marketplaceConfirmationDueAt: Date | null;
    cancelledBy?: string | null;
    cancellationReason?: string | null;
    depositRefundable?: boolean | null;
    rescheduleCount?: number;
    serviceLocation?: "IN_CLINIC" | "HOME" | "VIDEO";
  }) {
    // ADR-039: additive `telehealth` block (sessionId + patient join URL + window) and derived visitType for VIDEO bookings.
    const session = row.serviceLocation === "VIDEO" ? await this.prisma.telehealthSession.findUnique({ where: { appointmentId: row.id } }) : null;
    return {
      ...(session ? { visitType: "TELEHEALTH" as const, telehealth: telehealthBlock(session, { startsAt: row.startsAt, endsAt: row.endsAt }) } : {}),
      appointmentId: row.id,
      serviceLocation: row.serviceLocation ?? "IN_CLINIC",
      clinicId: row.clinicId,
      clinicianId: row.clinicianId,
      patientId: row.patientId,
      typeId: row.appointmentTypeId,
      startsAt: row.startsAt.toISOString(),
      endsAt: (row.endsAt ? effectiveAppointmentEnd(row.startsAt, row.endsAt) : row.endsAt)?.toISOString() ?? null,
      status: row.status,
      externalReference: row.externalReference,
      bookingSource: row.bookingSource,
      marketplaceConfirmationDueAt: row.marketplaceConfirmationDueAt?.toISOString() ?? null,
      cancelledBy: row.cancelledBy ?? null,
      cancellationReason: row.cancellationReason ?? null,
      depositRefundable: row.depositRefundable ?? null,
      rescheduleCount: row.rescheduleCount ?? 0,
    };
  }
}