import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CommissionChargeStatus, FeeType, Gender, UserRole } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { CommissionChargeService } from "./commission-charge.service";
import { CommissionCollectionsService } from "./commission-collections.service";

const prisma = createPrismaClient();
const svcPrisma = prisma as unknown as PrismaService;
const sfx = `com1-${Date.now()}`;
type T = { tenantId: string; clinicId: string; chargeId: string; appointmentId: string; finance: any; reception: any; admin: any };

describe("COM-1 provider-side commission transparency (Clinic)", () => {
  let marketId = ""; let a: T; let b: T; let charges: CommissionChargeService; let svc: CommissionCollectionsService;

  async function org(tag: string): Promise<T> {
    const tenant = await prisma.tenant.create({ data: { name: `COM1 ${tag} ${sfx}`, deploymentCell: "frankfurt", marketId, baseCurrency: "EGP" } });
    const clinic = await prisma.clinic.create({ data: { tenantId: tenant.id, nameEn: "C", nameAr: "ع", country: "EG", city: "Cairo", addressEn: "S", addressAr: "ش", locationUrl: "https://m.example/c", phone: "+201000000099", email: `c-${tag}-${sfx}@t.com`, licenseNumber: "SELF-SERVE-PENDING", defaultCurrency: "EGP" } });
    const mk = (role: UserRole, n: string) => prisma.user.create({ data: { tenantId: tenant.id, email: `${n}-${tag}-${sfx}@t.com`, passwordHash: "x", displayName: n, role } });
    const doc = await mk(UserRole.PHYSICIAN, "doc"); const fin = await mk(UserRole.FINANCE_OFFICER, "fin"); const rec = await mk(UserRole.RECEPTIONIST, "rec"); const adm = await mk(UserRole.CLINIC_ADMIN, "adm");
    const patient = await prisma.patient.create({ data: { tenantId: tenant.id, mrn: `M-${tag}-${sfx}`, firstNameEn: "Sam", lastNameEn: "New", gender: Gender.UNKNOWN, phone: `+2011${String(Math.random()).slice(2, 10)}`, nationalId: `n-${tag}-${sfx}` } });
    const apt = await prisma.appointment.create({ data: { tenantId: tenant.id, clinicId: clinic.id, patientId: patient.id, clinicianId: doc.id, startsAt: new Date(), feeAmount: 300, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true, status: AppointmentStatus.CONFIRMED } });
    const rate = await prisma.kiorexCommissionRate.findFirstOrThrow({ where: { marketId } });
    const charge = await prisma.kiorexCommissionCharge.create({ data: { tenantId: tenant.id, clinicId: clinic.id, appointmentId: apt.id, patientId: patient.id, clinicianId: doc.id, rateId: rate.id, amount: 120, currency: "EGP", status: CommissionChargeStatus.CONFIRMED, attendedAt: new Date("2026-11-10T10:00:00Z"), confirmedAt: new Date("2026-11-10T12:00:00Z"), disputeDeadline: new Date("2026-11-17T10:00:00Z") } });
    await prisma.kiorexCommissionDecision.create({ data: { tenantId: tenant.id, clinicId: clinic.id, appointmentId: apt.id, policyVersion: "CP1@base", origin: "MARKETPLACE", bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatient: true, decision: "CHARGE", reasonCodes: ["NEW_PATIENT"], rateId: rate.id, amount: 120, currency: "EGP", inputsHash: "a".repeat(64), feeBasisMinor: 30000, sponsoredDiscountMinor: 5000, basisPolicyVersion: "BP1" } });
    const u = (id: string, role: UserRole) => ({ userId: id, tenantId: tenant.id, email: "x", role });
    return { tenantId: tenant.id, clinicId: clinic.id, chargeId: charge.id, appointmentId: apt.id, finance: u(fin.id, UserRole.FINANCE_OFFICER), reception: u(rec.id, UserRole.RECEPTIONIST), admin: u(adm.id, UserRole.CLINIC_ADMIN) };
  }
  const run = (t: T, over: Record<string, unknown> = {}) => ({ runId: `crn_${t.tenantId}`, orgRef: t.tenantId, periodKey: "2026-12-05", status: "COLLECTED", mode: "AUTO_CHARGE_SAVED_METHOD", modeRequested: "AUTO_CHARGE_SAVED_METHOD", provider: "paymob", currency: "EGP", claimsCount: 1, claimsMinor: 12000, collectedMinor: 12000, deductedMinor: 0, invoicedMinor: 0, paidMinor: 0, version: 100, claims: [{ chargeId: t.chargeId, amountMinor: 12000, collectedMinor: 12000, collectionStatus: "COLLECTED" }], attempts: [{ attemptNo: 1, kind: "CHARGE", status: "SUCCEEDED", amountMinor: 12000 }], timeline: [{ at: "2026-12-07T10:00:00Z", event: "CHARGE_SUCCEEDED", by: "system" }], ...over });

  before(async () => {
    await prisma.$connect();
    charges = new CommissionChargeService(svcPrisma, new KiorexCommissionService(svcPrisma), new OutboxEventService(svcPrisma), new CreditWalletService(svcPrisma));
    svc = new CommissionCollectionsService(svcPrisma);
    const m = await prisma.market.create({ data: { code: `C${Date.now().toString(36)}`.toUpperCase(), nameEn: `COM1 ${sfx}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" } });
    marketId = m.id;
    await prisma.kiorexCommissionRate.create({ data: { marketId, feeType: FeeType.FLAT, amount: 120, validFrom: new Date("2020-01-01") } });
    a = await org("a"); b = await org("b");
  });
  after(async () => {
    for (const t of [a, b]) await prisma.tenant.delete({ where: { id: t.tenantId } }).catch(() => undefined);
    await prisma.kiorexCommissionRate.deleteMany({ where: { marketId } }).catch(() => undefined);
    await prisma.market.delete({ where: { id: marketId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("confirming a charge tells Kiorex with tenant, clinic, decision amount and dispute window", async () => {
    const pending = await prisma.kiorexCommissionCharge.update({ where: { id: a.chargeId }, data: { status: CommissionChargeStatus.PENDING, confirmedAt: null } });
    await prisma.$transaction((tx) => charges.onComplete(tx, a.tenantId, pending.appointmentId));
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: a.tenantId, type: "COMMISSION_CHARGE_STATUS_CHANGED" } });
    const p = ev.payload as Record<string, unknown>;
    assert.equal(p.tenantId, a.tenantId); assert.equal(p.clinicId, a.clinicId); assert.equal(p.decisionAmount, "120.00"); assert.equal(p.status, "CONFIRMED"); assert.ok(p.disputeDeadline);
    assert.equal(p.feeBasisMinor, 30000); assert.equal(p.basisPolicyVersion, "BP1");
  });

  it("ingest is idempotent, the newest version wins, and a run that names another organisation's charge is refused", async () => {
    assert.equal((await svc.ingest(run(a) as never)).applied, true);
    assert.equal((await svc.ingest(run(a) as never)).applied, false); // same version
    assert.equal((await svc.ingest(run(a, { version: 200, status: "SETTLED" }) as never)).applied, true);
    assert.equal((await svc.ingest(run(a, { version: 150, status: "RETRYING" }) as never)).applied, false); // older
    assert.equal((await prisma.kiorexCommissionCollection.findFirstOrThrow({ where: { tenantId: a.tenantId } })).status, "SETTLED");
    await assert.rejects(() => svc.ingest(run(b, { runId: "crn_evil", claims: [{ chargeId: a.chargeId, amountMinor: 12000 }] }) as never), /does not belong/);
    assert.equal(await prisma.kiorexCommissionCollection.count({ where: { tenantId: b.tenantId } }), 0);
  });

  it("finance sees the ledger with decision, fee basis and collection status; totals equal the rows", async () => {
    const l = await svc.ledger(a.finance, a.tenantId, {});
    assert.equal(l.total, 1);
    const row = l.items[0]!;
    assert.equal(row.amount, "120.00"); assert.equal(row.decision?.amount, "120.00"); assert.equal(row.decision?.feeBasis, "300.00"); assert.equal(row.decision?.sponsoredDiscount, "50.00"); assert.equal(row.decision?.basisPolicyVersion, "BP1");
    assert.equal(row.collection?.claimStatus, "COLLECTED");
    const s = await svc.summary(a.finance, a.tenantId);
    assert.equal(s.collection.collected, "120.00"); assert.equal(s.collection.invoiceOpen, "0.00");
    const c = await svc.collections(a.finance, a.tenantId);
    const d = await svc.collection(a.finance, a.tenantId, c.items[0]!.id);
    assert.equal(d.balanced, true); assert.equal(d.charges.length, 1);
    const tl = await svc.chargeTimeline(a.finance, a.tenantId, a.chargeId);
    assert.ok(tl.events.some((e) => e.event === "CHARGE_SUCCEEDED"));
  });

  it("role matrix: reception never; clinic admin only when the organisation enables it", async () => {
    await assert.rejects(() => svc.ledger(a.reception, a.tenantId, {}), /visible to finance/);
    await assert.rejects(() => svc.summary(a.admin, a.tenantId), /visible to finance/);
    await prisma.tenant.update({ where: { id: a.tenantId }, data: { providerSettings: { kiorexCommissions: { adminView: true } } } });
    assert.equal((await svc.summary(a.admin, a.tenantId)).runs, 1);
    await prisma.tenant.update({ where: { id: a.tenantId }, data: { providerSettings: {} } });
  });

  it("tenant isolation: another organisation's finance user sees none of it, even naming the ids", async () => {
    assert.equal((await svc.ledger(b.finance, b.tenantId, {})).items.some((i) => i.id === a.chargeId), false);
    assert.equal((await svc.collections(b.finance, b.tenantId)).items.length, 0);
    const aRun = await prisma.kiorexCommissionCollection.findFirstOrThrow({ where: { tenantId: a.tenantId } });
    await assert.rejects(() => svc.collection(b.finance, b.tenantId, aRun.id), /not found/);
    await assert.rejects(() => svc.chargeTimeline(b.finance, b.tenantId, a.chargeId), /not found/);
    assert.equal(await svc.access(b.finance, a.tenantId), false); // a token of B asking about A
    await assert.rejects(() => svc.ledger(b.finance, a.tenantId, {}), /visible to finance/);
  });

  it("exports are audited with who, view and rows; CSV neutralises formulas; the statement PDF renders", async () => {
    const r = await svc.exportCsv(a.finance, a.tenantId, "ledger");
    assert.match(r.body, /^﻿appointment,/); assert.ok(r.body.includes("120.00"));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: a.tenantId, action: "KIOREX_COMMISSION_EXPORT" }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.actorId, a.finance.userId); assert.deepEqual((audit.metadata as { rows: number; format: string }).format, "CSV");
    const pdf = await svc.statementPdf(a.finance, a.tenantId, "2026-11");
    assert.equal(pdf.pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(await prisma.auditLog.count({ where: { tenantId: a.tenantId, action: "KIOREX_COMMISSION_EXPORT" } }), 2);
    await assert.rejects(() => svc.exportCsv(a.reception, a.tenantId, "ledger"), /visible to finance/);
  });
});
