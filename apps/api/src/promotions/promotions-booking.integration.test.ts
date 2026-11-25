import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BillingInterval, CommissionChargeStatus, CreditReason, FeeType, Gender, ListingStatus, PlanKey, Prisma, SubscriptionStatus, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { CreditPromotionHoldService } from "../credits/credit-promotion-hold.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { MarketplaceAccessService } from "../marketplace/marketplace-access.service";
import { MarketplaceBookingService } from "../marketplace/marketplace-booking.service";
import { MarketplacePatientIntakeService } from "../marketplace/marketplace-patient-intake.service";
import type { PlatformIntegrationPrincipal } from "../marketplace/platform-integration-client.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { NewPatientService } from "../patients/new-patient.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { emptyAvailabilityWeek } from "../scheduling/availability-week-schema";
import { SlotService } from "../scheduling/slot.service";
import { PromotionBudgetService } from "./promotion-budget.service";
import { PromotionCompletionConsumer } from "./promotion-completion.consumer";
import { PromotionsMarketplaceController } from "./promotions-marketplace.controller";
import { PromotionService, type VersionBody } from "./promotion.service";

/** GRW-P2-S through the real booking intake: the signed reserve command, the optional `sponsoredDiscount` block, completion debit, and the commission decision with and without a promotion. */
const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const D = (n: number) => new Prisma.Decimal(String(n));
const suffix = `p2sb-${Date.now()}`;

describe("GRW-P2-S booking intake and commission basis", () => {
  let tenantId = ""; let clinicId = ""; let doctorId = ""; let typeId = ""; let ownerId = ""; let client: PlatformIntegrationPrincipal; let marketId = ""; let rateId = "";
  const wallet = new CreditWalletService(svc); const outbox = new OutboxEventService(svc);
  const budget = new PromotionBudgetService(svc, new CreditPromotionHoldService(svc, wallet), wallet, outbox);
  const promos = new PromotionService(svc, outbox); const consumer = new PromotionCompletionConsumer(svc, budget);
  const controller = new PromotionsMarketplaceController(svc, budget, promos);
  const stack = () => { const audit = new AuditService(svc); const ob = new AppointmentOutboxService(outbox); const slots = new SlotService(svc, outbox); const access = new MarketplaceAccessService(svc);
    return new MarketplaceBookingService(svc, access, new MarketplacePatientIntakeService(svc), {} as AppointmentsService, new ConsentPolicyService(svc, audit), audit, outbox, ob, slots, new NewPatientService(svc), { notifyKiorexBooking: async () => ({ queued: 0 }) } as never, undefined, undefined, undefined, undefined, budget); };
  const slot = (n: number) => { const m = new Date(Date.now() + (12 + 7 * n) * 86_400_000); while (m.getUTCDay() !== 1) m.setUTCDate(m.getUTCDate() + 1); m.setUTCHours(8, 0, 0, 0); return { startsAt: m.toISOString(), endsAt: new Date(m.getTime() + 30 * 60_000).toISOString() }; };
  const bodyOf = (n: number, extra: Record<string, unknown> = {}) => ({ clinicId, clinicianId: doctorId, typeId, ...slot(n), patient: { phone: `+20101111${1000 + n}`, firstNameEn: "Ali", lastNameEn: "Test", gender: Gender.M }, marketplaceConsentGranted: true, remindersConsentGranted: true, ...extra });
  const promoBody = (o: Partial<VersionBody> = {}): VersionBody => ({ nameAr: "خصم الكشف", nameEn: "Visit discount", patientCopyAr: "خصم على سعر الكشف برعاية العيادة", patientCopyEn: "A discount on the visit fee, sponsored by the clinic", scope: { doctorIds: [doctorId], appointmentTypeIds: [typeId], careTypes: ["IN_CLINIC"] }, discount: { kind: "FIXED_MINOR", value: 10_000 }, budgetCapMinor: 100_000, perPatientLimit: 2, eligibility: { newPatientsOnly: false, firstBookingOnly: false, minLeadHours: 1, kiorexOnly: true }, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 60 * 86_400_000).toISOString(), fundingMode: "WALLET_ONLY", ...o });
  async function active(o: Partial<VersionBody> = {}) { const a = { userId: ownerId, tenantId }; const p = await promos.create(a, promoBody(o)); await promos.submit(a, p.id); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" }); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" }); return p.id; }
  const reserve = (promotionId: string, n: number) => controller.reserve(promotionId, { version: 1, bookingRef: `KIOREX-${suffix}-${n}`, patientRef: `pref${n}${suffix}`, careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: `idem-${suffix}-${n}-aaaaaaaa` });

  before(async () => {
    await prisma.$connect();
    client = await prisma.platformIntegrationClient.create({ data: { name: `P2SB ${suffix}`, clientKey: `plt_p2sb_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] } });
    const market = await prisma.market.create({ data: { code: `P2B${suffix}`.slice(0, 12), nameEn: `P2SB ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } }); marketId = market.id; // a market of its own: the flat fee below is the only rate in it
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    tenantId = (await prisma.tenant.create({ data: { name: `P2SB ${suffix}`, deploymentCell: "frankfurt", marketId } })).id;
    clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: "Branch", nameAr: "فرع", country: "EG", city: "Cairo", addressEn: "Street", addressAr: "شارع", locationUrl: "https://maps.example/p2sb", timezone: "Africa/Cairo", phone: "201000000041", email: `p2sb.${suffix}@example.com`, licenseNumber: "EG-P2SB", defaultCurrency: "EGP", marketplaceBookingAutoConfirm: true } })).id;
    await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: 1, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
    doctorId = (await prisma.user.create({ data: { tenantId, email: `p2sb.dr.${suffix}@example.com`, passwordHash: bcrypt.hashSync("demo", 10), displayName: "Dr P2SB", role: UserRole.PHYSICIAN } })).id;
    ownerId = (await prisma.user.create({ data: { tenantId, email: `p2sb.own.${suffix}@example.com`, passwordHash: "x", displayName: "Owner", role: UserRole.CLINIC_ADMIN, isTenantOwner: true } })).id;
    await prisma.clinicianVerification.create({ data: { userId: doctorId, tenantId, status: VerificationStatus.VERIFIED, specialty: "GENERAL_MEDICINE", verifiedSpecialty: "GENERAL_MEDICINE", syndicateNumber: "SYND-P2SB", documentKeys: [] } });
    const week = emptyAvailabilityWeek("Africa/Cairo"); week.days[1]!.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId, clinicId, clinicianId: doctorId, weekJson: week } });
    typeId = (await prisma.appointmentType.create({ data: { tenantId, clinicId, nameEn: "Visit", nameAr: "كشف", durationMinutes: 30, feeAmount: 500, colorHex: "#3b82f6", marketplaceBookable: true, minNoticeMinutes: 0, maxDaysAhead: 90, isActive: true } })).id;
    await prisma.marketplaceListing.create({ data: { tenantId, clinicId, clinicianId: doctorId, status: ListingStatus.LIVE, profileJson: {} } });
    await wallet.grantInTransaction({ tenantId, amount: D(1000), reason: CreditReason.PROMO });
    rateId = (await prisma.kiorexCommissionRate.create({ data: { marketId, feeType: FeeType.FLAT, amount: 40, validFrom: new Date("2020-01-01") } })).id;
  });
  after(async () => { await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); await prisma.kiorexCommissionRate.delete({ where: { id: rateId } }).catch(() => undefined); await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined); await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined); await prisma.$disconnect(); });

  it("signed commands: reserve answers 200 {reservationRef, expiresAt}, a refusal is 409 with the contract code, an unknown promotion is 404, an unknown body field is 400, release is idempotent and always 200", async () => {
    const id = await active();
    const ok = await reserve(id, 1); assert.match(ok.reservationRef, /^prs_/); assert.ok(Date.parse(ok.expiresAt) > Date.now());
    await assert.rejects(() => controller.reserve(id, { version: 1, bookingRef: "b", patientRef: "p", careType: "HOME_VISIT", amountMinor: 10_000, currency: "EGP", idempotencyKey: "idem-xxxxxxxx" }), (e: { getStatus: () => number; getResponse: () => { code: string } }) => e.getStatus() === 409 && e.getResponse().code === "NOT_ELIGIBLE");
    await assert.rejects(() => controller.reserve("nope", { version: 1, bookingRef: "b", patientRef: "p", careType: "IN_CLINIC", amountMinor: 1, currency: "EGP", idempotencyKey: "idem-xxxxxxxx" }), (e: { getStatus: () => number }) => e.getStatus() === 404);
    await assert.rejects(() => controller.reserve(id, { version: 1, bookingRef: "b", patientRef: "p", careType: "IN_CLINIC", amountMinor: 1, currency: "EGP", idempotencyKey: "idem-xxxxxxxx", sub: "x" }), (e: { getStatus: () => number }) => e.getStatus() === 400);
    const r1 = await controller.release(id, { reservationRef: ok.reservationRef, idempotencyKey: "idem-release-1" }); assert.deepEqual(r1, { released: true });
    assert.deepEqual(await controller.release(id, { reservationRef: ok.reservationRef, idempotencyKey: "idem-release-2" }), { released: false });
    assert.deepEqual(await controller.release(id, { reservationRef: "prs_unknown", idempotencyKey: "idem-release-3" }), { released: false });
  });

  it("a booking with a valid reservation gets the sponsored line; the replay of the booking call answers the same; completion debits the wallet once; the commission decision names the basis and the fee is unchanged", async () => {
    const id = await active(); const r = await reserve(id, 2);
    const block = { promotionId: id, promotionVersion: 1, reservationRef: r.reservationRef, amountMinor: 10_000, currency: "EGP" };
    const booking = await stack().createBooking(client, `KIOREX-${suffix}-2`, bodyOf(2, { sponsoredDiscount: block })) as unknown as { appointmentId: string; sponsoredDiscount?: { applied: boolean; amountMinor?: number } };
    assert.deepEqual(booking.sponsoredDiscount, { applied: true, promotionId: id, reservationRef: r.reservationRef, amountMinor: 10_000, currency: "EGP" });
    const replay = await stack().createBooking(client, `KIOREX-${suffix}-2`, bodyOf(2, { sponsoredDiscount: block })) as unknown as { appointmentId: string; sponsoredDiscount?: { applied: boolean } };
    assert.equal(replay.appointmentId, booking.appointmentId); assert.equal(replay.sponsoredDiscount?.applied, true);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } })).state, "BOOKED");
    // attendance: check-in drives the commission decision, completion drives the debit
    const checkedIn = new Date(Date.now() - 3_600_000); const charges = new CommissionChargeService(svc, new KiorexCommissionService(svc), outbox, wallet);
    await prisma.$transaction(async (tx) => { await tx.appointment.update({ where: { id: booking.appointmentId }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: checkedIn } }); await charges.onCheckIn(tx, tenantId, booking.appointmentId, checkedIn); });
    const dec = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: booking.appointmentId } });
    assert.deepEqual([dec.decision, dec.feeBasisMinor, dec.sponsoredDiscountMinor, dec.basisPolicyVersion], ["CHARGE", 50_000, 10_000, "SPP-PROPOSED-DEFAULT"]);
    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: booking.appointmentId } });
    assert.equal(charge.amount.toFixed(2), "40.00"); // the flat Kiorex fee is unchanged by the promotion
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "COMMISSION_CHARGE_CREATED", aggregateId: booking.appointmentId } });
    assert.deepEqual([(ev.payload as Record<string, unknown>).feeBasisMinor, (ev.payload as Record<string, unknown>).sponsoredDiscountMinor], [50_000, 10_000]);
    await prisma.appointment.update({ where: { id: booking.appointmentId }, data: { status: AppointmentStatus.COMPLETED } });
    const before = Number((await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId } })).balance);
    await consumer.runOnce(); await consumer.runOnce();
    assert.equal(Number((await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId } })).balance), before - 100);
    assert.equal(charge.status, CommissionChargeStatus.PENDING);
  });

  it("a booking without any promotion has a decision and an event exactly as before (no new field)", async () => {
    const booking = await stack().createBooking(client, `KIOREX-${suffix}-3`, bodyOf(3)) as unknown as { appointmentId: string; sponsoredDiscount?: unknown };
    assert.equal(booking.sponsoredDiscount, undefined);
    const t = new Date(Date.now() - 3_600_000); const charges = new CommissionChargeService(svc, new KiorexCommissionService(svc), outbox, wallet);
    await prisma.$transaction(async (tx) => { await tx.appointment.update({ where: { id: booking.appointmentId }, data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: t } }); await charges.onCheckIn(tx, tenantId, booking.appointmentId, t); });
    const dec = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: booking.appointmentId } });
    assert.deepEqual([dec.feeBasisMinor, dec.sponsoredDiscountMinor, dec.basisPolicyVersion], [null, null, null]);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "COMMISSION_CHARGE_CREATED", aggregateId: booking.appointmentId } });
    assert.ok(!("feeBasisMinor" in (ev.payload as object)));
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: booking.appointmentId } })).amount.toFixed(2), "40.00");
  });

  it("a released or unknown reservation never refuses the booking: it is created without the discount and the answer says why; a malformed block is a 400", async () => {
    const id = await active(); const r = await reserve(id, 4);
    await controller.release(id, { reservationRef: r.reservationRef, idempotencyKey: "idem-rel-4-xxxx" });
    const b = await stack().createBooking(client, `KIOREX-${suffix}-4`, bodyOf(4, { sponsoredDiscount: { promotionId: id, promotionVersion: 1, reservationRef: r.reservationRef, amountMinor: 10_000, currency: "EGP" } })) as unknown as { appointmentId: string; sponsoredDiscount: { applied: boolean; reason?: string } };
    assert.ok(b.appointmentId); assert.deepEqual([b.sponsoredDiscount.applied, b.sponsoredDiscount.reason], [false, "RESERVATION_RELEASED"]);
    const u = await stack().createBooking(client, `KIOREX-${suffix}-5`, bodyOf(5, { sponsoredDiscount: { promotionId: id, promotionVersion: 1, reservationRef: "prs_unknown", amountMinor: 10_000, currency: "EGP" } })) as unknown as { sponsoredDiscount: { applied: boolean; reason?: string } };
    assert.deepEqual([u.sponsoredDiscount.applied, u.sponsoredDiscount.reason], [false, "RESERVATION_NOT_FOUND"]);
    await assert.rejects(() => stack().createBooking(client, `KIOREX-${suffix}-6`, bodyOf(6, { sponsoredDiscount: { promotionId: id, amountMinor: 1 } })), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
    assert.equal(await prisma.appointment.count({ where: { tenantId, externalReference: `KIOREX-${suffix}-6` } }), 0);
  });

  it("flag OFF contract: with clinic.provider_credit_v2 disabled the reserve command answers PAUSED and nothing is held", async () => {
    const id = await active(); const flags = { evaluate: async () => ({ effective: false }) } as never;
    const off = new PromotionBudgetService(svc, new CreditPromotionHoldService(svc, wallet), wallet, outbox, flags);
    const res = await off.reserve({ promotionId: id, version: 1, bookingRef: `off-${suffix}`, patientRef: "pref_off", careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: `idem-off-${suffix}` });
    assert.ok(!res.ok && res.reason === "PAUSED"); assert.equal(await prisma.promotionReservation.count({ where: { promotionId: id } }), 0);
  });
});
