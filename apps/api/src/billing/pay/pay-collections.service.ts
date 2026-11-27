import { payLinkBase } from "../../config/host-config";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import {
  clampMatchConfig, hmacHex, matchSignal, qrPlan, readLink, reportCsv, rollup, rollupTable, signLink, type LinkClaim, type PayContext, type RollupLevel, type RollupRow,
} from "@kiorex/pay-contract";
import type { JwtUser } from "../../auth/jwt-user";
import { effectiveRoles } from "../../common/effective-roles";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "../billing.service";
import { buildBilingualPdf } from "../../billing-platform/bilingual-pdf";
import { clinicIpnAdapter, fromMinor, invoiceTargets, outstandingMinor, PAY_FINANCE_ROLES, toMinor } from "./pay-collections";

const linkSecret = (): string => {
  const s = process.env.PAY_LINK_SECRET ?? "";
  if (s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("NEEDS_HUMAN: PAY_LINK_SECRET (32+ characters, Secrets Manager) is required in production");
  return "dev-only-clinic-pay-link-secret-000000000";
};
const INVOICE_INCLUDE = { lines: { select: { amountPaid: true } }, billingPayments: { select: { totalAmount: true } } } as const;

/**
 * Clinic collections on the shared Kiorly Pay contract (@kiorex/pay-contract): bank IPN rows matched to invoices (auto only when exact, otherwise a finance review queue), amount-locked payment
 * links with a QR plan, a contract-shaped "prepare collection" for the front desk, and branch / organisation rollups. Kiorly never holds funds; recording a payment here records money that a
 * licensed partner / the clinic's own account already received.
 */
@Injectable()
export class PayCollectionsService {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}

  assertFinance(user: JwtUser): string {
    const tenantId = user.tenantId;
    if (!tenantId) throw new ForbiddenException("Organisation context required");
    if (!effectiveRoles(user).some((r) => PAY_FINANCE_ROLES.includes(r))) throw new ForbiddenException("Finance role required");
    return tenantId;
  }

  private async candidates(tenantId: string) {
    const since = new Date(Date.now() - 180 * 86_400_000);
    return this.prisma.invoice.findMany({ where: { tenantId, issueDate: { gte: since } }, include: INVOICE_INCLUDE, orderBy: { issueDate: "desc" }, take: 2000 });
  }
  private async apply(tenantId: string, user: JwtUser, inv: { id: string; clinicId: string; patientId: string; currency: string }, amountMinor: number, method: PaymentMethod) {
    const p = await this.billing.recordPayment(tenantId, user, { clinicId: inv.clinicId, patientId: inv.patientId, invoiceId: inv.id, currency: inv.currency, allocations: [{ method, amount: fromMinor(amountMinor) }] });
    await this.consumeLink(tenantId, inv.id, amountMinor, p.id);
    return p;
  }

  // ───────── matching ─────────
  async ingestIpn(user: JwtUser, i: { content: string; format?: "csv" | "json"; filename?: string }) {
    const tenantId = this.assertFinance(user);
    const { events, rejected } = clinicIpnAdapter().ingestFile(i.content, { format: i.format });
    const invoices = await this.candidates(tenantId); const byId = new Map(invoices.map((x) => [x.id, x]));
    const cfg = clampMatchConfig().config; const taken = new Set<string>();
    const out = { received: events.length, rejected, applied: 0, queued: 0, duplicates: 0, failed: 0 };
    for (const ev of events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const dedupeKey = `IPN:${ev.pspRef}:${ev.type}`;
      if (await this.prisma.clinicPayMatch.findUnique({ where: { tenantId_dedupeKey: { tenantId, dedupeKey } }, select: { id: true } })) { out.duplicates++; continue; }
      const reversal = ev.type !== "payment.captured";
      const targets = reversal ? [] : invoiceTargets(invoices.filter((x) => !taken.has(x.id)).map((x) => ({ id: x.id, invoiceNumber: x.invoiceNumber, clinicId: x.clinicId, tenantId, currency: x.currency, issueDate: x.issueDate, patientName: x.patientName, lines: x.lines, billingPayments: x.billingPayments })));
      const r = reversal ? { decision: "REVIEW" as const, targetId: undefined as string | undefined, confidence: 0, reasons: ["REVERSAL_NEEDS_HUMAN"], candidates: [] as unknown[] } : matchSignal({ id: ev.eventId, source: "IPN", reference: ev.reference, amountMinor: ev.amountMinor, currency: ev.currency ?? "EGP", occurredAt: ev.occurredAt, pspRef: ev.pspRef }, targets, cfg);
      let status = "OPEN"; let decision: string = r.decision; let paymentId: string | undefined; let note: string | undefined;
      if (r.decision === "AUTO" && r.targetId) {
        const inv = byId.get(r.targetId)!;
        try { paymentId = (await this.apply(tenantId, user, inv, ev.amountMinor, PaymentMethod.TRANSFER)).id; status = "APPLIED"; taken.add(inv.id); out.applied++; }
        catch (e) { decision = "REVIEW"; note = `auto apply refused: ${(e as Error).message?.slice(0, 80)}`; out.failed++; }
      }
      if (status === "OPEN") out.queued++;
      await this.prisma.clinicPayMatch.create({ data: { tenantId, clinicId: r.targetId ? byId.get(r.targetId)?.clinicId : null, dedupeKey, source: "IPN", bankRef: ev.pspRef, reference: ev.reference ?? null, amount: new Prisma.Decimal(fromMinor(ev.amountMinor)), currency: ev.currency ?? "EGP", paidAt: new Date(ev.occurredAt), payerMasked: ev.payerMasked ?? null, eventKind: ev.type, decision, status, targetInvoiceId: r.targetId ?? null, confidence: r.confidence, reasons: r.reasons as never, candidates: r.candidates as never, paymentId: paymentId ?? null, note: note ?? null, decidedBy: status === "APPLIED" ? "auto" : null, decidedAt: status === "APPLIED" ? new Date() : null } });
    }
    await this.prisma.auditLog.create({ data: { tenantId, actorId: user.userId, action: "PAY_IPN_FILE_INGESTED", resource: "clinic_pay_match", resourceId: i.filename ?? null, metadata: { received: out.received, applied: out.applied, queued: out.queued } } });
    return out;
  }
  async queue(user: JwtUser, status = "OPEN") { const tenantId = this.assertFinance(user); return this.prisma.clinicPayMatch.findMany({ where: { tenantId, status }, orderBy: { createdAt: "asc" }, take: 200 }); }
  async confirm(user: JwtUser, id: string, invoiceId: string) {
    const tenantId = this.assertFinance(user);
    const m = await this.prisma.clinicPayMatch.findFirst({ where: { id, tenantId } }); if (!m) throw new NotFoundException("Match item not found");
    if (m.status !== "OPEN") throw new ConflictException("Match item was already decided");
    if (m.eventKind !== "payment.captured") throw new BadRequestException("Reversals are handled by finance with the bank");
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: INVOICE_INCLUDE }); if (!inv) throw new NotFoundException("Invoice not found");
    const amt = toMinor(m.amount);
    if (inv.currency.toUpperCase() !== m.currency.toUpperCase()) throw new ConflictException("Currency does not match the invoice");
    if (amt > outstandingMinor(inv)) throw new ConflictException("The payment is larger than what the invoice still owes");
    const claimed = await this.prisma.clinicPayMatch.updateMany({ where: { id, tenantId, status: "OPEN" }, data: { status: "CONFIRMED", targetInvoiceId: invoiceId, decidedBy: user.userId, decidedAt: new Date() } });
    if (!claimed.count) throw new ConflictException("Match item was already decided");
    try {
      const p = await this.apply(tenantId, user, inv, amt, PaymentMethod.TRANSFER);
      await this.prisma.clinicPayMatch.update({ where: { id }, data: { paymentId: p.id } });
      await this.prisma.auditLog.create({ data: { tenantId, actorId: user.userId, action: "PAY_MATCH_CONFIRMED", resource: "clinic_pay_match", resourceId: id, metadata: { invoiceId, paymentId: p.id } } });
      return { id, status: "CONFIRMED", paymentId: p.id };
    } catch (e) { await this.prisma.clinicPayMatch.updateMany({ where: { id, status: "CONFIRMED" }, data: { status: "OPEN", decidedBy: null, decidedAt: null } }); throw e; }
  }
  async reject(user: JwtUser, id: string, note?: string) {
    const tenantId = this.assertFinance(user);
    const r = await this.prisma.clinicPayMatch.updateMany({ where: { id, tenantId, status: "OPEN" }, data: { status: "REJECTED", decidedBy: user.userId, decidedAt: new Date(), note: note?.slice(0, 300) ?? null } });
    if (!r.count) throw new ConflictException("Match item not found or already decided");
    await this.prisma.auditLog.create({ data: { tenantId, actorId: user.userId, action: "PAY_MATCH_REJECTED", resource: "clinic_pay_match", resourceId: id } });
    return { id, status: "REJECTED" };
  }

  // ───────── front desk: collection prepared through the contract ─────────
  /** Which rail, reference, instructions and QR plan a front-desk collection uses. The reference is the invoice number (what the matcher reads); instructions come from the tenant's own channel. */
  async prepareCollection(user: JwtUser, i: { invoiceId: string; method: "CASH" | "CARD" | "TRANSFER" | "WALLET" }) {
    const tenantId = user.tenantId; if (!tenantId) throw new ForbiddenException("Organisation context required");
    const inv = await this.prisma.invoice.findFirst({ where: { id: i.invoiceId, tenantId }, include: INVOICE_INCLUDE }); if (!inv) throw new NotFoundException("Invoice not found");
    const due = outstandingMinor(inv); if (due <= 0) throw new ConflictException("Invoice is already settled");
    const rail = i.method === "CASH" ? "cash_desk" : i.method === "CARD" ? "card" : i.method === "WALLET" ? "wallet" : "bank_ipn";
    const channels = i.method === "TRANSFER" || i.method === "WALLET" ? await this.prisma.tenantPaymentChannel.findMany({ where: { tenantId }, orderBy: { name: "asc" } }) : [];
    return { rail, amountMinor: due, currency: inv.currency, reference: rail === "cash_desk" || rail === "card" ? null : inv.invoiceNumber, channels: channels.map((c) => ({ key: c.channelKey, name: c.name, mobileNumber: mask(c.mobileNumber), accountNumber: mask(c.accountNumber) })), matchedAutomatically: rail === "bank_ipn" || rail === "wallet" };
  }

  // ───────── links and QR ─────────
  async createLink(user: JwtUser, i: { context: "CLINIC_INVOICE" | "HOME_VISIT" | "FRONT_DESK"; subjectId: string; invoiceId?: string; clinicId: string; amount?: number; ttlSec?: number; rail?: string }) {
    const tenantId = user.tenantId; if (!tenantId) throw new ForbiddenException("Organisation context required");
    const clinic = await this.prisma.clinic.findFirst({ where: { id: i.clinicId, tenantId }, select: { id: true } }); if (!clinic) throw new NotFoundException("Branch not found");
    let amountMinor: number; let currency = "EGP";
    if (i.invoiceId) {
      const inv = await this.prisma.invoice.findFirst({ where: { id: i.invoiceId, tenantId }, include: INVOICE_INCLUDE }); if (!inv) throw new NotFoundException("Invoice not found");
      const due = outstandingMinor(inv); if (due <= 0) throw new ConflictException("Invoice is already settled");
      amountMinor = i.amount !== undefined ? toMinor(i.amount) : due;
      if (amountMinor <= 0 || amountMinor > due) throw new BadRequestException("Amount must be positive and not above what the invoice owes");
      currency = inv.currency;
    } else {
      if (i.amount === undefined || toMinor(i.amount) <= 0) throw new BadRequestException("amount is required without an invoice");
      amountMinor = toMinor(i.amount);
    }
    const row = await this.prisma.clinicPayLink.create({ data: { tenantId, clinicId: i.clinicId, context: i.context, subjectId: i.subjectId, invoiceId: i.invoiceId ?? null, amount: new Prisma.Decimal(fromMinor(amountMinor)), currency, rail: i.rail ?? "bank_transfer", expiresAt: new Date(Date.now() + 60_000), createdBy: user.userId } });
    const { token, claim } = signLink(linkSecret(), { id: row.id, ctx: i.context as PayContext, subject: i.subjectId, amountMinor, currency, org: tenantId, branch: i.clinicId, rail: row.rail, ttlSec: i.ttlSec });
    await this.prisma.clinicPayLink.update({ where: { id: row.id }, data: { expiresAt: new Date(claim.exp * 1000) } });
    const url = `${payLinkBase()}/pay/l/${token}`;
    const qr = qrPlan({ capabilities: { rails: [], capture: false, void: false, status: false, partialRefund: false, hostedCheckout: true, cardFacts: false, fileIngest: false, qr: "LINK" } }, { checkoutUrl: url });
    await this.prisma.clinicPayLink.update({ where: { id: row.id }, data: { qrKind: qr.kind } });
    await this.prisma.auditLog.create({ data: { tenantId, actorId: user.userId, action: "PAY_LINK_CREATED", resource: "clinic_pay_link", resourceId: row.id, metadata: { context: i.context, amountMinor } } });
    return { id: row.id, token, url, expiresAt: new Date(claim.exp * 1000).toISOString(), amountMinor, currency, qr: { kind: qr.kind, content: qr.content } };
  }
  /** Public: what the payer sees (amount, who, how to pay, reference). Read-only and repeatable; the link is consumed by the payment itself. */
  async linkView(token: string) {
    const r = readLink(linkSecret(), token); if (!r.ok) throw new NotFoundException("Payment link not found");
    const c: LinkClaim = r.claim; const row = await this.prisma.clinicPayLink.findUnique({ where: { id: c.id } }); if (!row) throw new NotFoundException("Payment link not found");
    const status = row.cancelledAt ? "CANCELLED" : row.usedAt ? "USED" : row.expiresAt < new Date() ? "EXPIRED" : "ACTIVE";
    const channels = status === "ACTIVE" ? await this.prisma.tenantPaymentChannel.findMany({ where: { tenantId: row.tenantId } }) : [];
    const inv = row.invoiceId ? await this.prisma.invoice.findFirst({ where: { id: row.invoiceId }, select: { invoiceNumber: true, clinicNameEn: true, clinicNameAr: true } }) : null;
    return { status, amount: Number(row.amount), currency: row.currency, expiresAt: row.expiresAt.toISOString(), reference: inv?.invoiceNumber ?? null, clinicNameEn: inv?.clinicNameEn ?? null, clinicNameAr: inv?.clinicNameAr ?? null, channels: channels.map((x) => ({ name: x.name, mobileNumber: x.mobileNumber, accountNumber: x.accountNumber })) };
  }
  async cancelLink(user: JwtUser, id: string) {
    const tenantId = user.tenantId; if (!tenantId) throw new ForbiddenException("Organisation context required");
    const r = await this.prisma.clinicPayLink.updateMany({ where: { id, tenantId, usedAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
    if (!r.count) throw new ConflictException("Link not found, already used or already cancelled");
    return { id, status: "CANCELLED" };
  }
  /** One atomic claim: the first payment of exactly the locked amount for the invoice consumes its active link. */
  async consumeLink(tenantId: string, invoiceId: string, amountMinor: number, paymentId: string) {
    const links = await this.prisma.clinicPayLink.findMany({ where: { tenantId, invoiceId, usedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } } });
    for (const l of links) if (toMinor(l.amount) === amountMinor) { const r = await this.prisma.clinicPayLink.updateMany({ where: { id: l.id, usedAt: null }, data: { usedAt: new Date(), paymentId } }); if (r.count) return l.id; }
    return null;
  }

  // ───────── rollups ─────────
  async rollupRows(tenantId: string, from: Date, to: Date): Promise<RollupRow[]> {
    const rows = await this.prisma.billingPayment.findMany({ where: { tenantId, createdAt: { gte: from, lt: to } }, include: { allocations: true }, take: 50_000 });
    return rows.flatMap((p) => p.allocations.map((a) => ({ at: p.createdAt.toISOString(), organisationId: tenantId, branchId: p.clinicId, psp: a.method.toLowerCase(), currency: p.currency, state: "CAPTURED" as const, amountMinor: toMinor(a.amount) })));
  }
  async report(user: JwtUser, q: { level: RollupLevel; from: Date; to: Date; lang: "en" | "ar"; format: "json" | "csv" | "pdf" }) {
    const tenantId = this.assertFinance(user);
    if (!(q.from < q.to) || q.to.getTime() - q.from.getTime() > 366 * 86_400_000) throw new BadRequestException("from must be before to, at most one year");
    const lines = rollup(await this.rollupRows(tenantId, q.from, q.to), q.level === "platform" ? "organisation" : q.level);
    const table = rollupTable(lines, q.lang, q.lang === "ar" ? "تقرير التحصيل" : "Collections rollup", new Date().toISOString());
    if (q.format === "csv") return { contentType: "text/csv; charset=utf-8", body: reportCsv(table) };
    if (q.format === "pdf") {
      const rtl = q.lang === "ar";
      return { contentType: "application/pdf", body: buildBilingualPdf([{ direction: rtl ? "rtl" : "ltr", rows: [{ kind: "text", text: table.title, size: 14, bold: true }, { kind: "rule" }, ...[table.header, ...table.rows.slice(0, 80)].map((cells, i) => ({ kind: "columns" as const, cells: [cells[0]!, cells[2]!, cells[6]!, cells[9]!, cells[10]!], widths: [3, 1, 2, 2, 1], size: 9, bold: i === 0 }))] }]) };
    }
    return { contentType: "application/json", body: { lines, table } };
  }
}
const mask = (v: string | null) => (v && v.length > 4 ? `${"*".repeat(Math.min(6, v.length - 4))}${v.slice(-4)}` : v ? "****" : null);
void hmacHex;
