import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CommissionChargeStatus, FeeType, Gender, UserRole } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { createHash, createHmac } from "node:crypto";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { CommissionChargeService } from "./commission-charge.service";
import { CommissionCollectionsService } from "./commission-collections.service";
import { loadRateParams } from "./commission-rate-params";

/**
 * COM-3 provider side on a PRIVATE database (DATABASE_URL must be a gap_*, e2e_* or test_* database). Every rate, text and figure is a TEST placeholder.
 * Parity: the run push below has the exact claim shape Kiorex pushes (platform `commission-collection.service`: disputeStatus, disputeDeadline, tender, rateSource, rateSnapshot) and the same charge must read the same in the
 * Clinic ledger as in the Kiorex ops claim row.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/\/(gap_|e2e_|test_)[a-z0-9_]+(\?|$)/.test(url)) throw new Error("COM-3 integration test needs DATABASE_URL pointing at a PRIVATE database (gap_*, e2e_*, test_*)");
const prisma = createPrismaClient();
const svcPrisma = prisma as unknown as PrismaService;
const sfx = `com3-${Date.now()}`;
type T = { tenantId: string; clinicId: string; chargeId: string; appointmentId: string; finance: any; reception: any; admin: any };

describe("COM-3 provider side: parity, disclosure, statement, tender, parameters", () => {
  let marketId = ""; let a: T; let b: T; let charges: CommissionChargeService; let svc: CommissionCollectionsService; let fake: Server; let fakeBase = ""; const seen: { path: string; headers: Record<string, string | string[] | undefined> }[] = [];
  const snapshot = { source: "DEFAULT", policyId: "pol1", version: 3, effectiveFrom: "2026-12-01T00:00:00.000Z", spec: { feeType: "FLAT", flatMinor: 12000 }, expectedMinor: 12000 };
  const fixtureStatement = (orgRef: string) => ({ orgRef, period: { from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" }, currency: "EGP", payoutMethod: "BANK_TRANSFER", onlineCollectionsMinor: 50000, cashVisitCommissionAccruedMinor: 12000, cashVisitCommissionNettedMinor: 4000, cashVisitCommissionOpenMinor: 8000, cashVisitCharges: 1, deductions: { commissionMinor: 4000, feesMinor: null, refundsMinor: 0, chargebacksMinor: 0 }, commission: { totalMinor: 12000, collectedMinor: 4000, openMinor: 8000, disputedOpen: 0 }, netPayableMinor: 46000, paidByBankTransferMinor: 46000, payouts: [{ payoutRef: "po-1", paidAt: "2026-12-10T00:00:00.000Z", cashMinor: 46000, commissionDeductedMinor: 4000, bankReference: "po-1", reconciliation: "MATCHED" }], reconciliation: "MATCHED", unknownFutureField: { x: 1 } });

  async function org(tag: string): Promise<T> {
    const tenant = await prisma.tenant.create({ data: { name: `COM3 ${tag} ${sfx}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    const clinic = await prisma.clinic.create({ data: { tenantId: tenant.id, nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/c", phone: "+201000000099", email: `c-${tag}-${sfx}@t.com`, licenseNumber: "SELF-SERVE-PENDING", defaultCurrency: "EGP" } });
    const mk = (role: UserRole, n: string) => prisma.user.create({ data: { tenantId: tenant.id, email: `${n}-${tag}-${sfx}@t.com`, passwordHash: "x", displayName: n, role } });
    const doc = await mk(UserRole.PHYSICIAN, "doc"); const fin = await mk(UserRole.FINANCE_OFFICER, "fin"); const rec = await mk(UserRole.RECEPTIONIST, "rec"); const adm = await mk(UserRole.CLINIC_ADMIN, "adm");
    const patient = await prisma.patient.create({ data: { tenantId: tenant.id, mrn: `M-${tag}-${sfx}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: `+2011${String(Math.random()).slice(2, 10)}`, nationalId: `n-${tag}-${sfx}` } });
    const apt = await prisma.appointment.create({ data: { tenantId: tenant.id, clinicId: clinic.id, patientId: patient.id, clinicianId: doc.id, startsAt: new Date(), feeAmount: 300, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.CONFIRMED, checkInCollectionMode: "CASH_ON_VISIT" } });
    const rate = await prisma.kiorexCommissionRate.findFirstOrThrow({ where: { marketId } });
    const charge = await prisma.kiorexCommissionCharge.create({ data: { tenantId: tenant.id, clinicId: clinic.id, appointmentId: apt.id, patientId: patient.id, clinicianId: doc.id, rateId: rate.id, amount: 120, currency: "EGP", status: CommissionChargeStatus.CONFIRMED, attendedAt: new Date(), confirmedAt: new Date(), disputeDeadline: new Date(Date.now() + 9 * 86_400_000) } });
    const u = (id: string, role: UserRole) => ({ userId: id, tenantId: tenant.id, email: "x", role });
    return { tenantId: tenant.id, clinicId: clinic.id, chargeId: charge.id, appointmentId: apt.id, finance: u(fin.id, UserRole.FINANCE_OFFICER), reception: u(rec.id, UserRole.RECEPTIONIST), admin: u(adm.id, UserRole.CLINIC_ADMIN) };
  }
  const run = (t: T, over: Record<string, unknown> = {}) => ({ runId: `crn_${t.tenantId}`, orgRef: t.tenantId, periodKey: "2026-12-05", status: "COLLECTED", mode: "NET_FROM_PAYOUT", provider: null, currency: "EGP", claimsCount: 1, claimsMinor: 12000, collectedMinor: 4000, deductedMinor: 4000, invoicedMinor: 0, paidMinor: 0, version: 100,
    claims: [{ chargeId: t.chargeId, appointmentId: t.appointmentId, amountMinor: 12000, collectedMinor: 4000, collectionStatus: "PARTIAL", chargeStatus: "CONFIRMED", disputeStatus: "OPEN", disputeDeadline: "2026-12-20T00:00:00.000Z", tender: "CASH", rateSource: "DEFAULT", rateSnapshot: snapshot, someFutureField: 1 }], attempts: [], timeline: [{ at: "2026-12-07T10:00:00Z", event: "DEDUCTED_FROM_PAYOUT", by: "system" }], ...over });
  const rateView = (t: T, version: string, extra: Record<string, unknown> = {}) => ({ orgRef: t.tenantId, product: "CLINIC", version, history: [{ version: 1, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2020-01-01T00:00:00Z", reason: null, spec: { feeType: "PERCENT", percentBps: 1000, flatMinor: null, minMinor: null, maxMinor: null, mode: null, graceDays: 6, retryDays: [2, 6], invoiceDueDays: 11, reminderDays: [-4, 0], disputeWindowDays: 9, savedMethodChargeAllowed: false } }], ...extra });

  before(async () => {
    await prisma.$connect();
    charges = new CommissionChargeService(svcPrisma, new KiorexCommissionService(svcPrisma), new OutboxEventService(svcPrisma), new CreditWalletService(svcPrisma));
    svc = new CommissionCollectionsService(svcPrisma);
    const m = await prisma.market.create({ data: { code: `C${Date.now().toString(36)}`.toUpperCase().slice(0, 8), nameEn: `COM3 ${sfx}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } });
    marketId = m.id;
    await prisma.kiorexCommissionRate.create({ data: { marketId, feeType: FeeType.FLAT, amount: 120, validFrom: new Date("2020-01-01") } });
    a = await org("a"); b = await org("b");
    fake = createServer((req, res) => {
      seen.push({ path: req.url ?? "", headers: req.headers });
      res.setHeader("content-type", req.url?.includes("/export") ? "text/csv" : "application/json");
      const org = String(req.headers["x-kiorly-org-ref"] ?? "");
      res.end(req.url?.includes("/export") ? "item,amount,deducted,bankReference,status\r\nnetPayable,460.00,,,\r\n" : JSON.stringify(fixtureStatement(org)));
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
    fakeBase = `http://127.0.0.1:${(fake.address() as { port: number }).port}/api/v1`;
  });
  after(async () => {
    await new Promise((r) => fake.close(r));
    for (const t of [a, b]) await prisma.tenant.delete({ where: { id: t.tenantId } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.deleteMany({ where: { marketId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("run push with the extra claim fields is stored; an old push without them and a push with unknown fields do not break", async () => {
    assert.equal((await svc.ingest(run(a) as never)).applied, true);
    const stored = (await prisma.kiorexCommissionCollection.findFirstOrThrow({ where: { tenantId: a.tenantId } })).claims as Array<Record<string, unknown>>;
    assert.deepEqual([stored[0]!.tender, stored[0]!.disputeStatus, stored[0]!.rateSource, "someFutureField" in stored[0]!], ["CASH", "OPEN", "DEFAULT", false]);
    const old = run(a, { version: 101, claims: [{ chargeId: a.chargeId, amountMinor: 12000 }] });
    assert.equal((await svc.ingest(old as never)).applied, true);
    assert.equal((await svc.ledger(a.finance, a.tenantId, {})).items[0]!.disputeStatus, null);
    assert.equal((await svc.ingest(run(a, { version: 102 }) as never)).applied, true);
  });

  it("PARITY: one charge reads the same in the Clinic ledger as in the Kiorex ops claim row (status, collected, dispute, deadline, tender, rate source and snapshot)", async () => {
    const pushed = run(a).claims[0]!; // what Kiorex ops shows for this claim is exactly this row
    const row = (await svc.ledger(a.finance, a.tenantId, {})).items[0]!;
    assert.equal(row.status, pushed.chargeStatus);
    assert.equal(row.collection?.claimStatus, pushed.collectionStatus);
    assert.equal(row.disputeStatus, pushed.disputeStatus);
    assert.equal(row.disputeDeadline, pushed.disputeDeadline);
    assert.equal(row.tender, pushed.tender);
    assert.equal(row.rateSource, pushed.rateSource);
    assert.deepEqual(row.rateSnapshot, pushed.rateSnapshot);
    assert.equal(row.amount, (pushed.amountMinor / 100).toFixed(2));
    const timeline = await svc.chargeTimeline(a.finance, a.tenantId, a.chargeId);
    assert.ok(timeline.events.some((e) => e.event === "DEDUCTED_FROM_PAYOUT"));
    const csv = (await svc.exportCsv(a.finance, a.tenantId, "ledger")).body;
    assert.match(csv, /tender,disputeDeadline,rateSource/); assert.match(csv, /CASH/);
  });

  it("rate view: disclosure blocks only when wording is set, counsel STATUS only, parameters surfaced; tolerant of absent and unknown fields", async () => {
    await svc.ingestRate(rateView(a, "400"));
    let r = await svc.rate(a.finance, a.tenantId);
    assert.deepEqual([r.disclosure, r.counsel], [null, null]); // an old view: nothing invented
    assert.equal(r.params.invoiceDueDays, 11);
    await svc.ingestRate(rateView(a, "401", { disclosure: { rateDisclosure: { en: "", ar: "" }, termsSummary: { en: "", ar: "" }, showOverrideReason: false, wordingSet: false }, counsel: { status: "NOT_REVIEWED", reviewedOn: null } }));
    r = await svc.rate(a.finance, a.tenantId);
    assert.equal(r.disclosure, null); assert.equal(r.counsel?.status, "NOT_REVIEWED");
    await svc.ingestRate(rateView(a, "402", { disclosure: { rateDisclosure: { en: "TEST rate text", ar: "نص تجريبي" }, termsSummary: { en: "", ar: "" }, showOverrideReason: true, wordingSet: true }, counsel: { status: "APPROVED_WITH_CONDITIONS", reviewerName: "Secret Name", documentId: "DOC-1", conditions: "secret conditions", reviewedOn: "2026-11-30" }, aFutureBlock: {} }));
    r = await svc.rate(a.finance, a.tenantId);
    assert.deepEqual(r.disclosure?.rateDisclosure, { en: "TEST rate text", ar: "نص تجريبي" });
    assert.deepEqual(r.counsel, { status: "APPROVED_WITH_CONDITIONS" });
    const raw = JSON.stringify((await prisma.kiorexCommissionRateView.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).view);
    assert.doesNotMatch(raw, /Secret Name|DOC-1|secret conditions/); assert.doesNotMatch(JSON.stringify(r), /Secret Name|DOC-1|secret conditions/);
    await svc.ingestRate(rateView(a, "403", { disclosure: "garbage", counsel: { status: "WHO_KNOWS" } })); // malformed extras never break the view
    r = await svc.rate(a.finance, a.tenantId);
    assert.deepEqual([r.disclosure, r.counsel, r.state], [null, null, "SET"]);
  });

  it("the rate parameters Kiorex pushed replace the Clinic constants; an organisation without them keeps the defaults", async () => {
    const p = await loadRateParams(svcPrisma as never, a.tenantId);
    assert.deepEqual([p.graceDays, p.retryDays, p.invoiceDueDays, p.reminderDays, p.disputeWindowDays, p.savedMethodChargeAllowed], [6, [2, 6], 11, [-4, 0], 9, false]);
    const none = await loadRateParams(svcPrisma as never, b.tenantId);
    assert.deepEqual([none.graceDays, none.retryDays, none.invoiceDueDays, none.savedMethodChargeAllowed], [null, null, null, null]);
  });

  it("tender goes to Kiorex on the claim: CASH for a cash visit, ONLINE for a Kiorex Pay deposit; persisted on the charge", async () => {
    const pending = await prisma.kiorexCommissionCharge.update({ where: { id: a.chargeId }, data: { status: CommissionChargeStatus.PENDING, confirmedAt: null } });
    await prisma.$transaction((tx) => charges.onComplete(tx, a.tenantId, pending.appointmentId));
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: a.tenantId, type: "COMMISSION_CHARGE_STATUS_CHANGED" }, orderBy: { createdAt: "desc" } });
    assert.equal((ev.payload as Record<string, unknown>).tender, "CASH");
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: a.chargeId } })).tender, "CASH");
    await prisma.patientDeposit.create({ data: { tenantId: a.tenantId, clinicId: a.clinicId, patientId: (await prisma.appointment.findUniqueOrThrow({ where: { id: a.appointmentId } })).patientId, appointmentId: a.appointmentId, amount: 100, currency: "EGP", method: "KIOREX_PAY", source: "KIOREX_PAY", status: "HELD" } });
    await prisma.$transaction(async (tx) => charges.emitStatusChanged(tx, await tx.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: a.chargeId } })));
    const ev2 = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: a.tenantId, type: "COMMISSION_CHARGE_STATUS_CHANGED" }, orderBy: { createdAt: "desc" } });
    assert.equal((ev2.payload as Record<string, unknown>).tender, "ONLINE");
  });

  it("statement (mock): mirrored from the Clinic's own rows; finance and admin read it, reception never; another organisation is never visible; export is audited", async () => {
    await prisma.kiorexPayout.create({ data: { tenantId: a.tenantId, payoutRef: "po-local", amount: 80, currency: "EGP", paidAt: new Date(), commissionDeducted: 40 } });
    const now = new Date(); const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.kiorexCommissionCharge.update({ where: { id: a.chargeId }, data: { tender: "CASH", status: CommissionChargeStatus.CONFIRMED } });
    const s = await svc.statement(a.finance, a.tenantId, period);
    assert.deepEqual([s.source, s.payoutMethod, s.onlineCollectionsMinor, s.deductions.commissionMinor, s.netPayableMinor, s.cashVisitCommissionAccruedMinor, s.payouts.length], ["LOCAL_MIRROR", "BANK_TRANSFER", 12000, 4000, 8000, 12000, 1]);
    assert.equal(s.cashVisitCommissionNettedMinor, 4000);
    await svc.statement(a.admin, a.tenantId, period).then(() => assert.fail("admin view is off by default"), (e: Error) => assert.match(e.message, /visible to finance/));
    await assert.rejects(() => svc.statement(a.reception, a.tenantId, period), /visible to finance/);
    await assert.rejects(() => svc.statement(a.finance, b.tenantId, period), /visible to finance/); // never another organisation
    await assert.rejects(() => svc.statement(a.finance, a.tenantId, "2026-13"), /YYYY-MM/);
    const empty = await svc.statement(b.finance, b.tenantId, period);
    assert.equal(empty.reconciliation, "NO_PAYOUT");
    const csv = await svc.statementExport(a.finance, a.tenantId, period);
    assert.match(csv.body, /cashVisitCommissionAccrued,120\.00/);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: a.tenantId, action: "KIOREX_COMMISSION_EXPORT", resourceId: "settlement-statement" } }));
  });

  it("statement (real): fetched from the Kiorex statement API with the partner HMAC, normalised tolerantly; an unreachable Kiorex is a clear 503, never invented figures", async () => {
    const env = { ...process.env };
    process.env.KIOREX_STATEMENT_MODE = "real"; process.env.KIOREX_API_BASE_URL = fakeBase; process.env.KIOREX_OUTBOX_WEBHOOK_SECRET = "test-secret-xyz"; process.env.KIOREX_EVIDENCE_CLIENT_KEY = "kx_test_client";
    try {
      const s = await svc.statement(a.finance, a.tenantId, "2026-12");
      assert.deepEqual([s.source, s.orgRef, s.onlineCollectionsMinor, s.netPayableMinor, s.reconciliation, s.payouts[0]?.bankReference], ["KIOREX", a.tenantId, 50000, 46000, "MATCHED", "po-1"]);
      assert.equal("unknownFutureField" in (s as object), false);
      const call = seen.at(-1)!; const h = call.headers;
      const path = call.path.split("?")[0]!;
      assert.equal(path, "/api/v1/partner/commissions/settlement-statement");
      assert.equal(h["x-kiorly-org-ref"], a.tenantId); assert.equal(h["x-kiorly-client-key"], "kx_test_client");
      const sha = createHash("sha256").update("").digest("hex");
      assert.equal(h["x-kiorly-signature"], createHmac("sha256", "test-secret-xyz").update(`${h["x-kiorly-timestamp"]}\n${h["x-kiorly-nonce"]}\nGET\n${path}\n${sha}`).digest("base64url"));
      assert.ok(call.path.includes("from=2026-12-01") && call.path.includes("to=2027-01-01"));
      const csv = await svc.statementExport(a.finance, a.tenantId, "2026-12");
      assert.match(csv.body, /netPayable,460\.00/); assert.equal(seen.at(-1)!.path.split("?")[0], "/api/v1/partner/commissions/settlement-statement/export");
      process.env.KIOREX_API_BASE_URL = "http://127.0.0.1:1/api/v1";
      await assert.rejects(() => svc.statement(a.finance, a.tenantId, "2026-12"), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "STATEMENT_UNAVAILABLE");
      delete process.env.KIOREX_OUTBOX_WEBHOOK_SECRET;
      await assert.rejects(() => svc.statement(a.finance, a.tenantId, "2026-12"), (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code === "STATEMENT_NOT_CONFIGURED");
    } finally {
      for (const k of ["KIOREX_STATEMENT_MODE", "KIOREX_API_BASE_URL", "KIOREX_OUTBOX_WEBHOOK_SECRET", "KIOREX_EVIDENCE_CLIENT_KEY"]) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    }
  });
});
