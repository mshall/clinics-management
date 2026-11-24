import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CreditReason, Gender, Prisma } from "@prisma/client";
import { CreditPromotionHoldService } from "../credits/credit-promotion-hold.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { PromotionBudgetService } from "./promotion-budget.service";
import { PromotionCompletionConsumer } from "./promotion-completion.consumer";
import { PromotionReconcileService } from "./promotion-reconcile.service";
import { PromotionService, type VersionBody } from "./promotion.service";

/** GRW-P2-S against the real database: review flow, budget cap race, reservation, booking, completion debit, cancel, refund reversal, shortfall, reconciliation RC-S1 to RC-S5. */
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
const suffix = `p2s-${Date.now()}`;
let seq = 0;
const dayMs = 86_400_000;

describe("GRW-P2-S sponsored promotions (Clinic)", () => {
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

  it("review flow: the content guard refuses clinical wording, two reviews open, the author cannot decide, a decision is final, and approval activates", async () => {
    const bad = await promos.create(actor(), body({ nameEn: "Free surgery", patientCopyEn: "Free surgery for all" }));
    await assert.rejects(() => promos.submit(actor(), bad.id), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "PROMOTION_CONTENT_REJECTED");
    assert.equal((await prisma.sponsoredPromotion.findUniqueOrThrow({ where: { id: bad.id } })).status, "DRAFT");
    const p = await promos.create(actor(), body());
    const submitted = await promos.submit(actor(), p.id);
    assert.equal(submitted.status, "IN_REVIEW"); assert.deepEqual(submitted.reviews.map((r) => r.kind).sort(), ["CONTENT", "SCOPE"]);
    await assert.rejects(() => promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: ownerId }), /Forbidden|author/i);
    const one = await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" });
    assert.equal(one.status, "IN_REVIEW");
    const again = await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" }); // replay
    assert.equal(again.status, "IN_REVIEW");
    await assert.rejects(() => promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "REJECTED", decidedBy: "kx_rev_b" }), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "REVIEW_ALREADY_DECIDED");
    const done = await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    assert.equal(done.status, "ACTIVE");
    assert.ok((await prisma.outboxEvent.count({ where: { aggregateId: p.id, type: "PROVIDER_PROMOTION_UPDATED" } })) >= 2);
  });

  it("high value needs a THIRD review by a different approver (maker-checker); the same person for both is invalid", async () => {
    const p = await promos.create(actor(), body({ budgetCapMinor: 6_000_000 }));
    const s = await promos.submit(actor(), p.id); assert.deepEqual(s.reviews.map((r) => r.kind).sort(), ["CONTENT", "HIGH_VALUE", "SCOPE"]);
    for (const k of ["CONTENT", "SCOPE", "HIGH_VALUE"] as const) await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: k, decision: "APPROVED", decidedBy: "kx_rev_a" });
    assert.notEqual((await prisma.sponsoredPromotion.findUniqueOrThrow({ where: { id: p.id } })).status, "ACTIVE"); // same approver twice: not approved
    const q = await promos.create(actor(), body({ budgetCapMinor: 6_000_000 })); await promos.submit(actor(), q.id);
    await promos.applyReviewDecision({ promotionId: q.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" });
    await promos.applyReviewDecision({ promotionId: q.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    const ok = await promos.applyReviewDecision({ promotionId: q.id, version: 1, reviewKind: "HIGH_VALUE", decision: "APPROVED", decidedBy: "kx_rev_b" });
    assert.equal(ok.status, "ACTIVE");
  });

  it("versions are immutable and an edit is a new version that needs a new review; the budget ledger and audit are append-only", async () => {
    const id = await activePromo();
    const v1 = await prisma.sponsoredPromotionVersion.findFirstOrThrow({ where: { promotionId: id } });
    await assert.rejects(() => prisma.sponsoredPromotionVersion.update({ where: { id: v1.id }, data: { budgetCapMinor: 999_999 } }), /immutable/);
    await assert.rejects(() => prisma.sponsoredPromotionVersion.delete({ where: { id: v1.id } }), /immutable/);
    const r = await rsv(id); assert.equal(r.ok, true);
    const entry = await prisma.promotionBudgetEntry.findFirstOrThrow({ where: { promotionId: id } });
    await assert.rejects(() => prisma.promotionBudgetEntry.update({ where: { id: entry.id }, data: { amountMinor: 1 } }), /append-only/);
    await assert.rejects(() => prisma.promotionBudgetEntry.delete({ where: { id: entry.id } }), /append-only/);
    await assert.rejects(() => prisma.promotionAudit.deleteMany({ where: { promotionId: id } }), /append-only/);
    const v2 = await promos.newVersion(actor(), id, body({ budgetCapMinor: 100_000 }));
    assert.equal(v2.status, "DRAFT"); assert.equal(v2.version.version, 2);
    const stale = await rsv(id, { version: 1 }); assert.equal(stale.ok, false); // the running version is no longer offered
    const held = await prisma.promotionReservation.findFirstOrThrow({ where: { promotionId: id } }); assert.equal(held.state, "RESERVED"); // the earlier hold keeps its place
  });

  it("the database refuses a commit that would put the exposure above the cap (deferred constraint), and a negative exposure", async () => {
    const id = await activePromo({ budgetCapMinor: 20_000 });
    const v = await prisma.sponsoredPromotionVersion.findFirstOrThrow({ where: { promotionId: id } });
    await assert.rejects(() => prisma.promotionBudgetEntry.create({ data: { promotionId: id, versionId: v.id, type: "RESERVE", amountMinor: 20_001, idempotencyKey: `cap-${suffix}-1`, reason: "TEST" } }), /cap exceeded/);
    await assert.rejects(() => prisma.promotionBudgetEntry.create({ data: { promotionId: id, versionId: v.id, type: "RELEASE", amountMinor: 5, idempotencyKey: `cap-${suffix}-2`, reason: "TEST" } }), /negative/);
    await prisma.promotionBudgetEntry.create({ data: { promotionId: id, versionId: v.id, type: "RESERVE", amountMinor: 20_000, idempotencyKey: `cap-${suffix}-3`, reason: "TEST" } });
    await assert.rejects(() => prisma.promotionBudgetEntry.create({ data: { promotionId: id, versionId: v.id, type: "RESERVE", amountMinor: 1, idempotencyKey: `cap-${suffix}-4`, reason: "TEST" } }), /cap exceeded/);
  });

  it("20 parallel reservations against a cap that fits 7 give exactly 7; the rest are BUDGET_EXHAUSTED; the promotion turns EXHAUSTED", async () => {
    const id = await activePromo({ budgetCapMinor: 70_000, perPatientLimit: 1 });
    await grant(500);
    const results = await Promise.all(Array.from({ length: 20 }, () => rsv(id)));
    assert.equal(results.filter((r) => r.ok).length, 7);
    assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "BUDGET_EXHAUSTED"));
    assert.equal(await exposure(id), 70_000);
    assert.equal((await prisma.sponsoredPromotion.findUniqueOrThrow({ where: { id } })).status, "EXHAUSTED");
  });

  it("reserve refusals carry the contract reasons and replays return the same reservation", async () => {
    const id = await activePromo({ perPatientLimit: 1, perDayLimit: 3, budgetCapMinor: 500_000 });
    const first = await rsv(id, { patientRef: "pref_same", key: `idem-${suffix}-replay-xx` }); assert.equal(first.ok, true);
    const replay = await rsv(id, { patientRef: "pref_same", key: `idem-${suffix}-replay-xx` });
    assert.ok(replay.ok && first.ok && replay.reservationRef === first.reservationRef && replay.replay === true);
    assert.equal(await prisma.promotionReservation.count({ where: { promotionId: id } }), 1);
    const limit = await rsv(id, { patientRef: "pref_same" }); assert.ok(!limit.ok && limit.reason === "LIMIT_REACHED");
    const care = await rsv(id, { careType: "HOME_VISIT" }); assert.ok(!care.ok && care.reason === "NOT_ELIGIBLE");
    const high = await rsv(id, { amountMinor: 10_001 }); assert.ok(!high.ok && high.reason === "NOT_ELIGIBLE");
    await rsv(id); await rsv(id); const day = await rsv(id); assert.ok(!day.ok && day.reason === "LIMIT_REACHED"); // per-day limit 3: first + two more
    await promos.pause(actor(), id, "test"); const paused = await rsv(id); assert.ok(!paused.ok && paused.reason === "PAUSED");
    const unknown = await budget.reserve({ promotionId: "nope", version: 1, bookingRef: "b", patientRef: "p", careType: "IN_CLINIC", amountMinor: 1, currency: "EGP", idempotencyKey: "idem-unknown-xx" }); assert.ok(!unknown.ok);
  });

  it("wallet: WALLET_ONLY needs cover now (WALLET_INSUFFICIENT); the hold is a budget hold, the wallet balance is untouched until completion", async () => {
    const poor = await prisma.tenant.create({ data: { name: `Poor ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    const pClinic = await prisma.clinic.create({ data: { tenantId: poor.id, nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/c", phone: "+201000000078", email: `poor-${suffix}@test.com`, licenseNumber: "X", defaultCurrency: "EGP" } });
    const pOwner = await prisma.user.create({ data: { tenantId: poor.id, email: `po-${suffix}@test.com`, passwordHash: "x", displayName: "O", role: "CLINIC_ADMIN", isTenantOwner: true } });
    const pType = await prisma.appointmentType.create({ data: { tenantId: poor.id, clinicId: pClinic.id, nameEn: "Consult", feeAmount: 500, marketplaceBookable: true } });
    const a = { userId: pOwner.id, tenantId: poor.id };
    const mk = async () => { const p = await promos.create(a, body({ scope: { doctorIds: [], appointmentTypeIds: [pType.id], careTypes: ["IN_CLINIC"] } })); await promos.submit(a, p.id); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" }); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" }); return p.id; };
    const id = await mk();
    const none = await rsv(id); assert.ok(!none.ok && none.reason === "WALLET_INSUFFICIENT"); assert.equal(await exposure(id), 0);
    await wallet.grantInTransaction({ tenantId: poor.id, amount: D(100), reason: CreditReason.PROMO });
    const okR = await rsv(id); assert.equal(okR.ok, true);
    assert.equal(Number((await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: poor.id } })).balance), 100); // untouched
    const second = await rsv(id); assert.ok(!second.ok && second.reason === "WALLET_INSUFFICIENT"); // 100 EGP covers exactly one 100 EGP hold
    await prisma.tenant.delete({ where: { id: poor.id } });
  });

  it("booking, completion debit exactly once (replay safe), the wallet is debited, and the sponsored line is distinct in the ledger; a debit without attendance evidence is refused", async () => {
    const id = await activePromo({ budgetCapMinor: 500_000 });
    const before = await balance();
    const r = await rsv(id); assert.ok(r.ok); const ref = r.reservationRef;
    const aptId = await bookedAppointment(id, ref);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: ref } })).state, "BOOKED");
    await prisma.appointment.update({ where: { id: aptId }, data: { status: AppointmentStatus.COMPLETED } }); // completed but never checked in: no attendance evidence
    const held = await consumer.runOnce(); assert.equal(held.held >= 1, true);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: ref } })).state, "BOOKED"); assert.equal(await balance(), before);
    await prisma.appointment.update({ where: { id: aptId }, data: { checkedInAt: new Date(Date.now() - 3_600_000) } });
    const a = await consumer.runOnce(); assert.ok(a.debited >= 1);
    assert.equal(await balance(), before - 100); // 10,000 minor = 100.00
    const again = await consumer.runOnce(); assert.equal(again.debited, 0);
    const direct = await budget.debitForAppointment(tenantId, aptId); assert.equal(direct.state, "DEBITED");
    assert.equal(await prisma.promotionBudgetEntry.count({ where: { promotionId: id, type: "DEBIT" } }), 1);
    assert.equal(await balance(), before - 100);
    const w = await prisma.creditLedgerEntry.findFirstOrThrow({ where: { campaignRef: id, reason: CreditReason.SPONSORED_PROMOTION } }); assert.equal(Number(w.amount), -100);
    assert.equal(await exposure(id), 10_000);
    assert.equal((await prisma.outboxEvent.findMany({ where: { aggregateId: id, type: "SponsoredDiscountDebited" } })).length, 1);
  });

  it("cancel and no-show before completion release the hold (wallet untouched); expiry sweeper releases an unbooked hold", async () => {
    const id = await activePromo({ budgetCapMinor: 500_000 });
    const before = await balance();
    const r1 = await rsv(id); assert.ok(r1.ok); const a1 = await bookedAppointment(id, r1.reservationRef);
    await prisma.appointment.update({ where: { id: a1 }, data: { status: AppointmentStatus.CANCELLED } });
    const r2 = await rsv(id); assert.ok(r2.ok); const a2 = await bookedAppointment(id, r2.reservationRef);
    await prisma.appointment.update({ where: { id: a2 }, data: { status: AppointmentStatus.NO_SHOW } });
    const c = await consumer.runOnce(); assert.ok(c.released >= 2);
    const r3 = await rsv(id); assert.ok(r3.ok);
    assert.equal(await budget.sweepExpired(new Date(Date.now() + 3_600_000)) >= 1, true);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r3.reservationRef } })).state, "RELEASED");
    assert.equal(await exposure(id), 0); assert.equal(await balance(), before);
    assert.equal(await prisma.creditReservation.count({ where: { promotionRef: id, state: "RESERVED" } }), 0);
    assert.equal(await prisma.promotionBudgetEntry.count({ where: { promotionId: id, type: "DEBIT" } }), 0);
  });

  it("a refund after completion reverses the debit once, returns the credit once and frees the budget; the patient is never paid", async () => {
    const id = await activePromo({ budgetCapMinor: 500_000 });
    const r = await rsv(id); assert.ok(r.ok);
    const aptId = await bookedAppointment(id, r.reservationRef, { status: AppointmentStatus.COMPLETED, checkedInAt: new Date(Date.now() - 7_200_000) });
    const base = await balance();
    await consumer.runOnce(); assert.equal(await balance(), base - 100);
    const rev = await budget.reverseForAppointment(tenantId, aptId, "REFUNDED"); assert.equal(rev.reversed, true);
    const rev2 = await budget.reverseForAppointment(tenantId, aptId, "REFUNDED"); assert.equal(rev2.reversed, false);
    assert.equal(await balance(), base); assert.equal(await exposure(id), 0);
    assert.equal(await prisma.creditLedgerEntry.count({ where: { campaignRef: id, reason: CreditReason.SPONSORED_PROMOTION_REVERSAL } }), 1);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } })).state, "REVERSED");
  });

  it("shortfall: WALLET_THEN_INVOICE records the uncovered part for the next invoice (and RC-S1 closes with it); WALLET_ONLY records it too but never invoices it", async () => {
    const t = await prisma.tenant.create({ data: { name: `Short ${suffix}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    const cl = await prisma.clinic.create({ data: { tenantId: t.id, nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/c", phone: "+201000000079", email: `short-${suffix}@test.com`, licenseNumber: "X", defaultCurrency: "EGP" } });
    const ow = await prisma.user.create({ data: { tenantId: t.id, email: `so-${suffix}@test.com`, passwordHash: "x", displayName: "O", role: "CLINIC_ADMIN", isTenantOwner: true } });
    const ty = await prisma.appointmentType.create({ data: { tenantId: t.id, clinicId: cl.id, nameEn: "Consult", feeAmount: 500, marketplaceBookable: true } });
    const pat = await prisma.patient.create({ data: { tenantId: t.id, mrn: `MS-${suffix}`, firstNameEn: "S", lastNameEn: "P", gender: Gender.UNKNOWN, phone: "+201055555555", nationalId: `ns-${suffix}` } });
    const a = { userId: ow.id, tenantId: t.id };
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(100), reason: CreditReason.PROMO });
    const p = await promos.create(a, body({ scope: { doctorIds: [], appointmentTypeIds: [ty.id], careTypes: ["IN_CLINIC"] }, fundingMode: "WALLET_THEN_INVOICE", budgetCapMinor: 100_000 }));
    await promos.submit(a, p.id); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" }); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    const r1 = await rsv(p.id); const r2 = await rsv(p.id); assert.ok(r1.ok && r2.ok); // the second hold is allowed with a shortfall
    for (const r of [r1, r2]) { if (!r.ok) continue; const rr = await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } });
      const apt = await prisma.appointment.create({ data: { tenantId: t.id, clinicId: cl.id, patientId: pat.id, clinicianId: ow.id, appointmentTypeId: ty.id, startsAt: new Date(Date.now() + 3_600_000 * 6), feeAmount: 500, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.COMPLETED, checkedInAt: new Date(Date.now() - 3_600_000), externalReference: rr.bookingRef } });
      const c = await prisma.$transaction((tx) => budget.confirmForBooking(tx, t.id, { promotionId: p.id, promotionVersion: 1, reservationRef: r.reservationRef, amountMinor: 10_000, currency: "EGP", bookingRef: rr.bookingRef, appointmentId: apt.id, patientPhone: "+201055555555", facts: { doctorId: ow.id, appointmentTypeId: ty.id, careType: "IN_CLINIC", startsAt: apt.startsAt, isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 50_000 } })); assert.ok(c.applied); }
    await consumer.runOnce();
    const rows = await prisma.promotionReservation.findMany({ where: { promotionId: p.id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((r) => [r.state, r.debitedMinor, r.shortfallMinor]), [["DEBITED", 10_000, 0], ["DEBITED", 0, 10_000]]);
    assert.equal(Number((await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: t.id } })).balance), 0);
    const rc = await reconcile.run(t.id); assert.deepEqual(rc.findings, []);
    await prisma.tenant.delete({ where: { id: t.id } });
  });

  it("reconciliation RC-S1, RC-S2 and RC-S5 hold after all of the above and detect an injected corruption", async () => {
    const rc = await reconcile.run(tenantId); assert.deepEqual(rc.findings, [], JSON.stringify(rc.findings));
    // inject: a wallet consume labelled for a promotion that no budget entry knows about
    const id = await activePromo({ budgetCapMinor: 100_000 });
    await wallet.consume(tenantId, 5, CreditReason.SPONSORED_PROMOTION, { campaignRef: id, use: "PROMOTIONS", idempotencyKey: `inj-${suffix}` });
    const bad = await reconcile.run(tenantId); assert.ok(bad.findings.some((f) => f.promotionId === id && f.code === "RC_S1"));
  });

  it("pause keeps a patient's reservation discount; archive is refused while a reservation is open; expiry ends a promotion", async () => {
    const id = await activePromo({ budgetCapMinor: 500_000 });
    const r = await rsv(id); assert.ok(r.ok);
    await promos.pause(actor(), id, "holiday");
    await assert.rejects(() => promos.archive(actor(), id), /OPEN_RESERVATIONS|Conflict/i);
    const apt = await bookedAppointment(id, r.reservationRef); assert.ok(apt); // a paused promotion still honours the reservation it already holds
    await promos.resume(actor(), id);
    const old = await promos.create(actor(), body({ startsAt: new Date(Date.now() - 2 * dayMs).toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString() }));
    await promos.submit(actor(), old.id); await promos.applyReviewDecision({ promotionId: old.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" }); await promos.applyReviewDecision({ promotionId: old.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    const t = await promos.tick(new Date(Date.now() + 5 * 60_000)); assert.ok(t.expired >= 1);
    assert.equal((await prisma.sponsoredPromotion.findUniqueOrThrow({ where: { id: old.id } })).status, "EXPIRED");
  });

  it("PF_PRICE_INFLATION blocks activation when the visit fee was raised above the reference; PF_SELF_DEAL drops the discount at booking (the booking stands)", async () => {
    const p = await promos.create(actor(), body({ budgetCapMinor: 500_000 }));
    await prisma.appointmentType.update({ where: { id: typeId }, data: { feeAmount: 700 } }); // raised after the reference price was snapshot (500)
    await promos.submit(actor(), p.id); await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "CONTENT", decision: "APPROVED", decidedBy: "kx_rev_a" });
    const held = await promos.applyReviewDecision({ promotionId: p.id, version: 1, reviewKind: "SCOPE", decision: "APPROVED", decidedBy: "kx_rev_a" });
    assert.equal(held.status, "APPROVED"); assert.ok((await prisma.promotionAudit.count({ where: { promotionId: p.id, action: "fraud.hold" } })) >= 1);
    await prisma.appointmentType.update({ where: { id: typeId }, data: { feeAmount: 500 } });
    const id = await activePromo({ budgetCapMinor: 500_000 });
    const r = await rsv(id); assert.ok(r.ok);
    const rr = await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } });
    const apt = await prisma.appointment.create({ data: { tenantId, clinicId, patientId, clinicianId: doctorId, appointmentTypeId: typeId, startsAt: new Date(Date.now() + 6 * 3_600_000), feeAmount: 500, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.CONFIRMED, externalReference: rr.bookingRef } });
    const staff = await prisma.employee.findFirst({ where: { tenantId } });
    const res = await prisma.$transaction((tx) => budget.confirmForBooking(tx, tenantId, { promotionId: id, promotionVersion: 1, reservationRef: r.reservationRef, amountMinor: 10_000, currency: "EGP", bookingRef: rr.bookingRef, appointmentId: apt.id, patientPhone: staff?.phone ?? "+201012345678", facts: { doctorId, appointmentTypeId: typeId, careType: "IN_CLINIC", startsAt: apt.startsAt, isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 50_000 } }));
    assert.deepEqual([res.applied, res.reason], [false, "PF_SELF_DEAL"]);
    assert.equal((await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } })).state, "RELEASED");
    assert.equal(await prisma.appointment.count({ where: { id: apt.id } }), 1);
  });

  it("booking-time ineligibility (not new to the clinic, wrong doctor, mismatched amount, unknown reservation) releases the hold and never refuses the booking", async () => {
    const id = await activePromo({ budgetCapMinor: 500_000, eligibility: { newPatientsOnly: true, firstBookingOnly: false, minLeadHours: 0, kiorexOnly: true } });
    const attempt = async (facts: Partial<{ isNewToClinic: boolean; doctorId: string }>, amountMinor = 10_000) => {
      const r = await rsv(id); assert.ok(r.ok); const rr = await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } });
      const apt = await prisma.appointment.create({ data: { tenantId, clinicId, patientId, clinicianId: doctorId, appointmentTypeId: typeId, startsAt: new Date(Date.now() + 6 * 3_600_000), feeAmount: 500, bookingSource: BookingSource.KIOREX_MARKETPLACE, status: AppointmentStatus.CONFIRMED, externalReference: rr.bookingRef } });
      const out = await prisma.$transaction((tx) => budget.confirmForBooking(tx, tenantId, { promotionId: id, promotionVersion: 1, reservationRef: r.reservationRef, amountMinor, currency: "EGP", bookingRef: rr.bookingRef, appointmentId: apt.id, patientPhone: "+201099999999", facts: { doctorId, appointmentTypeId: typeId, careType: "IN_CLINIC", startsAt: apt.startsAt, isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 50_000, ...facts } }));
      return { out, state: (await prisma.promotionReservation.findUniqueOrThrow({ where: { reservationRef: r.reservationRef } })).state };
    };
    assert.deepEqual((await attempt({ isNewToClinic: false })).out, { applied: false, reason: "NOT_NEW_TO_CLINIC" });
    assert.deepEqual((await attempt({ doctorId: "someone-else" })).out, { applied: false, reason: "DOCTOR_NOT_IN_SCOPE" });
    const mism = await attempt({}, 9_000); assert.deepEqual([mism.out.applied, mism.state], [false, "RELEASED"]);
    const unknown = await prisma.$transaction((tx) => budget.confirmForBooking(tx, tenantId, { promotionId: id, promotionVersion: 1, reservationRef: "prs_unknown", amountMinor: 1, currency: "EGP", bookingRef: "x", appointmentId: "y", patientPhone: null, facts: { doctorId, appointmentTypeId: typeId, careType: "IN_CLINIC", startsAt: new Date(), isNewToClinic: true, kiorexBookingsBefore: 0, channelIsKiorex: true, visitFeeMinor: 1 } }));
    assert.deepEqual(unknown, { applied: false, reason: "RESERVATION_NOT_FOUND" });
    assert.equal(await exposure(id), 0);
  });

  it("no ledger row of the module names a patient credit object, and the schema has no patient identifier column", async () => {
    const cols = await prisma.$queryRaw<{ column_name: string; table_name: string }[]>`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('SponsoredPromotion','SponsoredPromotionVersion','PromotionBudgetEntry','PromotionReservation','PromotionComplianceReview','PromotionAudit')`;
    for (const c of cols) assert.ok(!/^(sub|patientId|passportSub|phone|email|rewardLot|couponId)$/i.test(c.column_name), `${c.table_name}.${c.column_name}`);
    const rc = await reconcile.run(tenantId); assert.ok(!rc.findings.some((f) => f.code === "RC_S5"));
  });
});
