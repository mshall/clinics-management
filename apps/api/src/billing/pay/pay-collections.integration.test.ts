import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../../auth/jwt-user";
import type { PrismaService } from "../../prisma/prisma.service";
import { createPrismaClient } from "../../prisma/create-prisma-client";
import { BillingService } from "../billing.service";
import { PayCollectionsService } from "./pay-collections.service";

const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const pay = new PayCollectionsService(svc, new BillingService(svc));

/** Kiorly Pay unified collections on a private database: IPN matching, finance-only queue, amount-locked links, rollups, tenant isolation. */
describe("Pay unified collections (clinic)", () => {
  const stamp = Date.now(); let tenantId: string; let otherTenant: string; let clinicId: string; let patientId: string;
  let fin: JwtUser; let desk: JwtUser; let seq = 0;
  const user = async (t: string, role: UserRole, tag: string): Promise<JwtUser> => { const u = await prisma.user.create({ data: { tenantId: t, email: `pay.${tag}.${stamp}@example.com`, passwordHash: "x", displayName: tag, role } }); return { userId: u.id, tenantId: t, email: u.email, role, additionalRoles: [] } as unknown as JwtUser; };
  const invoice = (number: string, amount: number) => prisma.invoice.create({ data: { tenantId, clinicId, patientId, invoiceNumber: number, currency: "EGP", backgroundColor: "#fff", sectionsSnapshot: {}, patientName: "Ahmed Hassan", clinicNameEn: "B", clinicNameAr: "ف", clinicAddressEn: "a", clinicAddressAr: "ع", clinicPhone: "1", clinicEmail: "b@x.test", clinicLicenseNumber: "L", lines: { create: [{ purpose: "Consult", amountPaid: new Prisma.Decimal(String(amount)) }] } } });
  const file = (...rows: string[]) => ["bankRef,amount,currency,reference,paidAt,payer,status,type", ...rows].join("\n");
  const row = (bankRef: string, amount: string, ref: string) => `${bankRef},${amount},EGP,${ref},${new Date().toISOString()},Ahmed Hassan,success,credit`;
  const paid = async (invoiceId: string) => (await prisma.billingPayment.aggregate({ where: { invoiceId }, _sum: { totalAmount: true } }))._sum.totalAmount?.toString() ?? "0";

  before(async () => {
    await prisma.$connect();
    const base = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" }, include: { tenant: true } });
    tenantId = (await prisma.tenant.create({ data: { name: `PAY ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })).id;
    otherTenant = (await prisma.tenant.create({ data: { name: `PAY2 ${stamp}`, deploymentCell: base.tenant.deploymentCell, marketId: base.tenant.marketId } })).id;
    clinicId = (await prisma.clinic.create({ data: { tenantId, nameEn: `PAY Branch ${stamp}`, nameAr: "فرع", country: base.country, city: base.city, addressEn: "S", addressAr: "ش", locationUrl: "https://maps.example/pay", timezone: base.timezone, phone: base.phone, email: `pay.${stamp}@example.com`, licenseNumber: `PAY-${stamp}`, defaultCurrency: base.defaultCurrency } })).id;
    patientId = (await prisma.patient.create({ data: { tenantId, mrn: `PAY-${stamp}`, firstNameEn: "Ahmed", lastNameEn: "Hassan", gender: "UNKNOWN", phone: "+201055504002" } })).id;
    fin = await user(tenantId, UserRole.FINANCE_OFFICER, "fin"); desk = await user(tenantId, UserRole.RECEPTIONIST, "desk");
  });
  after(async () => {
    await prisma.clinicPayMatch.deleteMany({ where: { tenantId } }).catch(() => undefined); await prisma.clinicPayLink.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); await prisma.tenant.delete({ where: { id: otherTenant } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("exact reference + amount is applied as a TRANSFER payment; amount-only, partial and unknown wait for finance; a re-upload changes nothing", async () => {
    const a = await invoice(`INV-A-${stamp}`, 500); const b = await invoice(`INV-B-${stamp}`, 700); const c = await invoice(`INV-C-${stamp}`, 900);
    const f = file(row("B1", "500.00", a.invoiceNumber), row("B2", "300.00", b.invoiceNumber), row("B3", "900.00", ""), row("B4", "12.00", "nope"));
    const r = await pay.ingestIpn(fin, { content: f, format: "csv" });
    assert.deepEqual([r.received, r.applied, r.queued, r.duplicates], [4, 1, 3, 0]);
    assert.equal(await paid(a.id), "500"); assert.equal(await paid(c.id), "0", "amount-only is never applied");
    const methods = (await prisma.billingPaymentAllocation.findMany({ where: { payment: { invoiceId: a.id } } })).map((x) => x.method); assert.deepEqual(methods, ["TRANSFER"]);
    const again = await pay.ingestIpn(fin, { content: f, format: "csv" }); assert.deepEqual([again.applied, again.queued, again.duplicates], [0, 0, 4]);
    assert.equal(await paid(a.id), "500", "no double payment");
    const q = await pay.queue(fin); assert.equal(q.length, 3);
    // confirm: overpayment refused, correct pairing applies once
    const b3 = q.find((x) => x.bankRef === "B3")!; await assert.rejects(pay.confirm(fin, b3.id, b.id), /larger than what the invoice still owes/);
    assert.equal((await prisma.clinicPayMatch.findUniqueOrThrow({ where: { id: b3.id } })).status, "OPEN");
    await pay.confirm(fin, b3.id, c.id); assert.equal(await paid(c.id), "900");
    await assert.rejects(pay.confirm(fin, b3.id, c.id), /already decided/);
    const b2 = q.find((x) => x.bankRef === "B2")!; await pay.reject(fin, b2.id, "wrong payer"); assert.equal((await prisma.clinicPayMatch.findUniqueOrThrow({ where: { id: b2.id } })).status, "REJECTED");
  });

  it("the queue, upload and rollups are finance-only", async () => {
    await assert.rejects(pay.queue(desk), /Finance role required/); await assert.rejects(pay.ingestIpn(desk, { content: file() }), /Finance role required/);
    await assert.rejects(pay.report(desk, { level: "branch", from: new Date(Date.now() - 1e9), to: new Date(), lang: "en", format: "json" }), /Finance role required/);
  });

  it("tenant isolation: another organisation cannot see, confirm or match against these invoices", async () => {
    const other = await user(otherTenant, UserRole.FINANCE_OFFICER, "fin2");
    assert.equal((await pay.queue(other)).length, 0);
    const m = (await pay.queue(fin, "OPEN"))[0]; if (m) await assert.rejects(pay.confirm(other, m.id, "x"), /not found/);
    const inv = await invoice(`INV-ISO-${stamp}`, 100);
    const r = await pay.ingestIpn(other, { content: file(row("X1", "100.00", inv.invoiceNumber)), format: "csv" }); assert.equal(r.applied, 0);
  });

  it("links: amount-locked to what is owed, consumed by the exact payment, cancel and expiry refuse, front desk prepares through the contract", async () => {
    const inv = await invoice(`INV-L-${stamp}`, 400);
    await assert.rejects(pay.createLink(desk, { context: "CLINIC_INVOICE", subjectId: inv.id, invoiceId: inv.id, clinicId, amount: 401 }), /not above what the invoice owes/);
    const l = await pay.createLink(desk, { context: "CLINIC_INVOICE", subjectId: inv.id, invoiceId: inv.id, clinicId });
    assert.equal(l.amountMinor, 40000); assert.equal(l.qr.kind, "LINK");
    assert.equal((await pay.linkView(l.token)).status, "ACTIVE"); assert.equal((await pay.linkView(l.token)).reference, inv.invoiceNumber);
    const prep = await pay.prepareCollection(desk, { invoiceId: inv.id, method: "TRANSFER" }); assert.equal(prep.rail, "bank_ipn"); assert.equal(prep.reference, inv.invoiceNumber); assert.equal(prep.amountMinor, 40000);
    assert.equal((await pay.prepareCollection(desk, { invoiceId: inv.id, method: "CASH" })).reference, null);
    await pay.ingestIpn(fin, { content: file(row("L1", "400.00", inv.invoiceNumber)), format: "csv" });
    assert.equal((await pay.linkView(l.token)).status, "USED"); assert.equal(await paid(inv.id), "400");
    await assert.rejects(pay.cancelLink(desk, l.id), /already used/);
    const l2 = await pay.createLink(desk, { context: "FRONT_DESK", subjectId: "walkin-1", clinicId, amount: 50 }); await pay.cancelLink(desk, l2.id); assert.equal((await pay.linkView(l2.token)).status, "CANCELLED");
    await prisma.clinicPayLink.update({ where: { id: l.id }, data: { usedAt: null, expiresAt: new Date(Date.now() - 1000) } }); assert.equal((await pay.linkView(l.token)).status, "EXPIRED");
    await assert.rejects(pay.linkView("garbage"), /not found/);
  });

  it("branch rollup counts payments per branch; CSV has the BOM and Arabic headers; PDF is a PDF", async () => {
    const j = await pay.report(fin, { level: "branch", from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000), lang: "en", format: "json" }) as { body: { lines: { key: string; capturedMinor: number }[] } };
    const mine = j.body.lines.find((x) => x.key === `${tenantId}/${clinicId}`); assert.ok(mine); assert.ok(mine!.capturedMinor >= 140000);
    const csv = await pay.report(fin, { level: "branch", from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000), lang: "ar", format: "csv" }); assert.ok(String(csv.body).startsWith("﻿")); assert.ok(String(csv.body).includes("المجموعة"));
    const pdf = await pay.report(fin, { level: "organisation", from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000), lang: "ar", format: "pdf" }); assert.equal((pdf.body as Buffer).subarray(0, 5).toString(), "%PDF-");
  });
  it("the screen views: queue with invoice labels and candidates, summary with the safety floors, manual-match invoice search, per-item audit, invoice status and link list", async () => {
    const a = await invoice(`INV-V1-${stamp}`, 250); const b = await invoice(`INV-V2-${stamp}`, 250);
    const r = await pay.ingestIpn(fin, { content: file(row("V1", "250.00", a.invoiceNumber), row("V2", "250.00", `${b.invoiceNumber}-note`), row("V3", "77.00", "zzz")), format: "csv" });
    assert.deepEqual([r.applied, r.queued], [1, 2]);
    const open = await pay.queueView(fin, "OPEN"); const v2 = open.find((x) => x.bankRef === "V2")!; const v3 = open.find((x) => x.bankRef === "V3")!;
    assert.ok(open.every((x) => typeof x.amount === "number")); assert.ok(["REVIEW", "UNMATCHED"].includes(v2.decision));
    assert.ok(v2.candidateInvoices.some((c) => c.invoice?.invoiceNumber === b.invoiceNumber), "a partly matching reference suggests the invoice, labelled with its number");
    assert.equal(v3.candidateInvoices.length, 0);
    const applied = (await pay.queueView(fin, "APPLIED")).find((x) => x.bankRef === "V1")!; assert.equal(applied.targetInvoice?.invoiceNumber, a.invoiceNumber);
    const sum = await pay.matchSummary(fin); assert.ok(sum.byStatus.OPEN! >= 2 && sum.byStatus.APPLIED! >= 1);
    assert.equal(sum.floors.autoThresholdMin, 0.9); assert.ok(sum.config.autoThreshold >= sum.floors.autoThresholdMin && sum.config.autoMargin >= sum.floors.autoMarginMin);
    const found = await pay.invoiceCandidates(fin, b.invoiceNumber); assert.deepEqual(found.map((x) => [x.invoiceNumber, x.outstanding]), [[b.invoiceNumber, 250]]);
    assert.ok(!(await pay.invoiceCandidates(fin, a.invoiceNumber)).length, "a settled invoice is never offered");
    await assert.rejects(pay.invoiceCandidates(desk, ""), /Finance role required/); await assert.rejects(pay.matchAudit(desk, v2.id), /Finance role required/);
    await pay.confirm(fin, v2.id, b.id);
    const audit = await pay.matchAudit(fin, v2.id); assert.deepEqual(audit.events.map((e) => e.action), ["PAY_MATCH_RECEIVED", "PAY_MATCH_CONFIRMED"]); assert.equal(audit.status, "CONFIRMED");
    const autoAudit = await pay.matchAudit(fin, applied.id); assert.deepEqual(autoAudit.events.map((e) => e.action), ["PAY_MATCH_RECEIVED", "PAY_MATCH_AUTO_APPLIED"]);
    const l = await pay.createLink(desk, { context: "CLINIC_INVOICE", subjectId: a.id, invoiceId: a.id, clinicId, amount: 1 }).catch((e: Error) => e);
    assert.match(String((l as Error).message), /already settled/);
    const st = await pay.invoiceStatus(fin, b.id); assert.equal(st.invoice.state, "CAPTURED"); assert.equal(st.matches.length >= 1, true); assert.equal(st.payments.length, 1);
    const deskStatus = await pay.invoiceStatus(desk, b.id); assert.equal(deskStatus.matches.length, 0, "bank rows are finance-only");
    const c = await invoice(`INV-V3-${stamp}`, 90); const link = await pay.createLink(desk, { context: "CLINIC_INVOICE", subjectId: c.id, invoiceId: c.id, clinicId });
    const list = await pay.listLinks(desk, { invoiceId: c.id }); assert.deepEqual(list.items.map((x) => [x.id, x.state, x.invoice?.invoiceNumber]), [[link.id, "ACTIVE", c.invoiceNumber]]);
    assert.equal((await pay.listLinks(desk, { invoiceId: c.id, state: "USED" })).items.length, 0);
    const other = await user(otherTenant, UserRole.FINANCE_OFFICER, "fin3"); assert.equal((await pay.listLinks(other, {})).items.length, 0); await assert.rejects(pay.invoiceStatus(other, b.id), /not found/);
  });

  it("safety floors hold: the match configuration cannot be made laxer than the contract floors, and a reversal row never auto-applies", async () => {
    const { clampMatchConfig, MATCH_FLOORS } = await import("@kiorex/pay-contract");
    const lax = clampMatchConfig({ autoThreshold: 0.1, autoMargin: 0, reviewThreshold: 0 }).config;
    assert.ok(lax.autoThreshold >= MATCH_FLOORS.autoThresholdMin && lax.autoMargin >= MATCH_FLOORS.autoMarginMin && lax.reviewThreshold >= MATCH_FLOORS.reviewThresholdMin);
    const inv = await invoice(`INV-R-${stamp}`, 60);
    const rev = `R1,60.00,EGP,${inv.invoiceNumber},${new Date().toISOString()},Ahmed Hassan,success,reversal`;
    const r = await pay.ingestIpn(fin, { content: file(rev), format: "csv" }); assert.equal(r.applied, 0); assert.equal(await paid(inv.id), "0");
    const item = (await pay.queueView(fin, "OPEN")).find((x) => x.bankRef === "R1")!; await assert.rejects(pay.confirm(fin, item.id, inv.id), /Reversals are handled by finance/);
  });
});
