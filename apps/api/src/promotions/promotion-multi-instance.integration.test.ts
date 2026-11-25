import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CreditReason, Gender, Prisma } from "@prisma/client";
import { CreditPromotionHoldService } from "../credits/credit-promotion-hold.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { PromotionBudgetService, ReserveBusyError } from "./promotion-budget.service";
import { PromotionCompletionConsumer } from "./promotion-completion.consumer";
import { PromotionReconcileService } from "./promotion-reconcile.service";
import { PromotionService, type VersionBody } from "./promotion.service";

/** Gap closure: the reserve is safe across instances. A second instance is the same service with its own in-memory gate over the same database. */
const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const wallet = new CreditWalletService(svc);
const hold = new CreditPromotionHoldService(svc, wallet);
const outbox = new OutboxEventService(svc);
const budget = new PromotionBudgetService(svc, hold, wallet, outbox);
const promos = new PromotionService(svc, outbox);
const consumer = new PromotionCompletionConsumer(svc, budget);
const reconcile = new PromotionReconcileService(svc);
const D = (n: number) => new Prisma.Decimal(String(n));
const suffix = `p2mi-${Date.now()}`;
let seq = 0;
const dayMs = 86_400_000;


/** A second API process: its own in-memory admission gate, the same database, wallet and outbox. */
const instance = (): PromotionBudgetService => new PromotionBudgetService(svc, hold, wallet, outbox);

describe("promotion reserve across two instances (gap closure)", () => {
  let tenantId = ""; let clinicId = ""; let doctorId = ""; let typeId = ""; let marketId = ""; let patientId = ""; let ownerId = "";
  const actor = () => ({ userId: ownerId, tenantId });
  const body = (o: Partial<VersionBody> = {}): VersionBody => ({
    nameAr: "خصم الزيارة الأولى", nameEn: "First visit discount", patientCopyAr: "خصم على سعر الكشف برعاية العيادة", patientCopyEn: "A discount on the visit fee, sponsored by the clinic",
    scope: { doctorIds: [doctorId], appointmentTypeIds: [typeId], careTypes: ["IN_CLINIC"] }, discount: { kind: "FIXED_MINOR", value: 10_000 }, budgetCapMinor: 70_000, perPatientLimit: 1,
    eligibility: { newPatientsOnly: false, firstBookingOnly: false, minLeadHours: 0, kiorexOnly: true }, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 30 * dayMs).toISOString(), fundingMode: "WALLET_ONLY", ...o,
  });
  /** A promotion approved by two Kiorex reviewers' rows and ACTIVE. */
  async function activePromo(o: Partial<VersionBody> = {}) {
    const p = await promos.create(actor(), body(o));
    await promos.submit(actor(), p.id);
    await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" });
    const done = await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    assert.equal(done.status, "ACTIVE");
    return p.id;
  }
  const rsv = (promotionId: string, o: Partial<{ amountMinor: number; patientRef: string; careType: string; version: number; key: string; bookingRef: string }> = {}) => {
    const n = ++seq; return budget.reserve({ promotionId, version: o.version ?? 1, bookingRef: o.bookingRef ?? `kx_bk_${suffix}_${n}`, patientRef: o.patientRef ?? `pref_${suffix}_${n}`, careType: o.careType ?? "IN_CLINIC", amountMinor: o.amountMinor ?? 10_000, currency: "EGP", idempotencyKey: o.key ?? `idem-${suffix}-${n}-xxxxxxxx` });
  };
  const exposure = async (promotionId: string) => {
    const e = await prisma.promotionBudgetEntry.findMany({ where: { promotionId } });
    const sum = (t: string) => e.filter((x) => x.type === t).reduce((s, x) => s + x.amountMinor, 0);
    return sum("RESERVE") + sum("DEBIT") - sum("RELEASE") - sum("REVERSE_DEBIT");
  };
  const grant = (n: number) => wallet.grantInTransaction({ tenantId, amount: D(n), reason: CreditReason.PROMO, note: "seed" });
  const balance = async () => Number((await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId } })).balance);
  async function bookedAppointment(promotionId: string, reservationRef: string, o: { status?: AppointmentStatus; checkedInAt?: Date | null; fee?: number } = {}) {
    const r = await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef } });
    const apt = await prisma.appointment.create({ data: { tenantId, clinicId, patientId, clinicianId: doctorId, appointmentTypeId: typeId, startsAt: new Date(Date.now() + 6 * 3_600_000), feeAmount: o.fee ?? 500, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: o.status ?? AppointmentStatus.CONFIRMED, checkedInAt: o.checkedInAt ?? null, externalReference: r.bookingRef } });
    const res = await prisma.$transaction((tx) => budget.confirmForBooking(tx, tenantId, { promotionId, promotionVersion: 1, reservationRef, amountMinor: r.amountMinor, currency: "EGP", bookingRef: r.bookingRef, appointmentId: apt.id, patientPhone: "+201099999999", facts: { doctorId, appointmentTypeId: typeId, careType: "IN_CLINIC", startsAt: apt.startsAt, isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 50_000 } }));
    assert.equal(res.applied, true, JSON.stringify(res));
    return apt.id;
  }

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.create({ data: { code: `P2S${suffix}`.slice(0, 12), nameEn: `P2S ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } });
    marketId = market.id;
    tenantId = (await prisma.tenant.create({ data: { name: `P2S ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } })).id;
    clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: "Clinic", nameAr: "عيادة", country: "EG", city: "Cairo", addressEn: "St", addressAr: "شارع", locationUrl: "https://maps.example/c", phone: "+201000000077", email: `c-${suffix}@test.com`, licenseNumber: "SELF-SERVE-PENDING", defaultCurrency: "EGP" } })).id;
    doctorId = (await prisma.user.create({ data: { tenantId, email: `doc-${suffix}@test.com`, passwordHash: "x", displayName: "Dr Sponsor", role: "PHYSICIAN" } })).id;
    ownerId = (await prisma.user.create({ data: { tenantId, email: `own-${suffix}@test.com`, passwordHash: "x", displayName: "Owner", role: "CLINIC_ADMIN", isTenantOwner: true } })).id;
    typeId = (await prisma.appointmentType.create({ data: { tenantId, clinicId, nameEn: "Consultation", nameAr: "كشف", feeAmount: 500, marketplaceBookable: true } })).id;
    patientId = (await prisma.patient.create({ data: { tenantId, mrn: `MRN-${suffix}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: "+201099999999", nationalId: `nat-${suffix}` } })).id;
    await prisma.employee.create({ data: { tenantId, clinicId, employeeNumber: `E-${suffix}`, firstNameEn: "Staff", lastNameEn: "One", phone: "+201012345678", jobTitle: "Nurse", employmentType: "FULL_TIME", hireDate: new Date("2024-01-01"), salaryBase: 1000 } });
    await grant(2000);
  });
  after(async () => { await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined); await prisma.$disconnect(); });


  it("two instances racing 20 reserves on a budget for 7 never overspend the cap: exactly 7 win, the rest are BUDGET_EXHAUSTED or busy, and every budget row is consistent", async () => {
    const promotionId = await activePromo({ budgetCapMinor: 70_000, perPatientLimit: 5 });
    const a = budget; const b = instance();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).reserve({ promotionId, version: 1, bookingRef: `kx_bk_${suffix}_r${i}`, patientRef: `pref_${suffix}_r${i}`, careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: `idem-${suffix}-r${i}-xxxxxxxx` }).catch((e) => e)));
    const won = results.filter((r) => r && (r as { ok?: boolean }).ok === true);
    const busy = results.filter((r) => r instanceof ReserveBusyError);
    const refused = results.filter((r) => r && (r as { ok?: boolean }).ok === false);
    assert.equal(won.length, 7, `won ${won.length}, busy ${busy.length}, refused ${refused.length}`);
    assert.equal(won.length + busy.length + refused.length, 20);
    for (const r of refused) assert.equal((r as { reason: string }).reason, "BUDGET_EXHAUSTED");
    assert.equal(await exposure(promotionId), 70_000);
  });

  it("the same idempotency key sent to both instances at once is one reservation and the same answer", async () => {
    const promotionId = await activePromo({ budgetCapMinor: 70_000, perPatientLimit: 5 });
    const a = budget; const b = instance(); const key = `idem-${suffix}-same-xxxxxxxx`;
    const input = { promotionId, version: 1, bookingRef: `kx_bk_${suffix}_same`, patientRef: `pref_${suffix}_same`, careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: key };
    const [x, y] = await Promise.all([a.reserve(input), b.reserve(input)]);
    assert.equal((x as { ok: boolean }).ok, true); assert.equal((y as { ok: boolean }).ok, true);
    assert.equal((x as { reservationRef: string }).reservationRef, (y as { reservationRef: string }).reservationRef);
    assert.equal(await prisma.promotionReservation.count({ where: { promotionId } }), 1);
    assert.equal(await exposure(promotionId), 10_000);
  });

  it("a promotion row lock held by another process is a bounded wait: the reserve answers busy within the bound and no connection is left waiting", async () => {
    const promotionId = await activePromo({ budgetCapMinor: 70_000, perPatientLimit: 5 });
    const b = instance(); b.lockWaitMs = 300;
    let releaseHolder!: () => void; const hold2 = new Promise<void>((r) => { releaseHolder = r; });
    let locked!: () => void; const isLocked = new Promise<void>((r) => { locked = r; });
    const holder = prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT "id" FROM "SponsoredPromotion" WHERE "id" = ${promotionId} FOR UPDATE`; locked(); await hold2; }, { timeout: 15_000 });
    await isLocked;
    const t0 = Date.now();
    await assert.rejects(() => b.reserve({ promotionId, version: 1, bookingRef: `kx_bk_${suffix}_lk`, patientRef: `pref_${suffix}_lk`, careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: `idem-${suffix}-lk-xxxxxxxx` }), (e) => e instanceof ReserveBusyError);
    const waited = Date.now() - t0;
    assert.ok(waited < 3_000, `waited ${waited} ms`);
    releaseHolder(); await holder;
    // nothing was written by the refused attempt, and the pool is free again
    assert.equal(await prisma.promotionReservation.count({ where: { promotionId } }), 0);
    await Promise.all(Array.from({ length: 15 }, () => prisma.promotionReservation.count()));
    const ok = await b.reserve({ promotionId, version: 1, bookingRef: `kx_bk_${suffix}_lk2`, patientRef: `pref_${suffix}_lk2`, careType: "IN_CLINIC", amountMinor: 10_000, currency: "EGP", idempotencyKey: `idem-${suffix}-lk2-xxxxxxxx` });
    assert.equal((ok as { ok: boolean }).ok, true);
  });
});
