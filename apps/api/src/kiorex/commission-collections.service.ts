import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { FinancialVisibilityOverride, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { buildBilingualPdf, type PdfRow } from "../billing-platform/bilingual-pdf";
import { loadUserMoneyVisibilityOverrides } from "../common/user-money-visibility";
import { PrismaService } from "../prisma/prisma.service";
import { adminViewEnabled, canViewKiorexCommissions } from "./kiorex-commission-access";
import { effectiveRateAt, parseCounselStatus, parseDisclosure, rateParamsOf, rateViewProblems, type RateHistoryRow } from "./commission-rate-view";
import { normalizeClaims, type ClaimView } from "./commission-claim-view";
import { localStatement, normalizeStatement, periodRange, statementCsv, type StatementView } from "./commission-statement";
import { asTender } from "./commission-tender";
import { kiorexApiBase } from "../marketplace/kiorex-connect.service";
import { signEvidenceRequest } from "./attribution-evidence.service";

export type CollectionBody = {
  runId: string; orgRef: string; periodKey: string; status: string; mode: string; modeRequested?: string | null; fallbackReason?: string | null; provider?: string | null; currency: string;
  claimsCount: number; claimsMinor: number; collectedMinor: number; deductedMinor: number; invoicedMinor: number; paidMinor: number; invoiceNo?: string | null; invoiceDueAt?: string | null;
  cutoffAt?: string | null; collectAt?: string | null; version: number;
  /** COM-3: also disputeStatus, disputeDeadline, tender, rateSource, rateSnapshot (all optional; see `normalizeClaim`). */
  claims?: Array<{ chargeId: string; appointmentId?: string; amountMinor: number; collectedMinor?: number; collectionStatus?: string; chargeStatus?: string; decisionRef?: string | null; feeBasisMinor?: number | null; sponsoredDiscountMinor?: number | null; basisPolicyVersion?: string | null } & Record<string, unknown>>;
  attempts?: unknown[]; timeline?: unknown[];
};
/** COM-2 (contracts 1.13.0 `CommissionRateView`): validated by `rateViewProblems`, not by decorators (the body is refused whole when malformed). */
export type CommissionRateViewBody = { orgRef: string; product: string; version: string; mode?: string | null; history: RateHistoryRow[]; disclosure?: unknown; counsel?: unknown };
export const EXPORT_VIEWS = ["ledger", "collections", "deductions", "disputes", "timeline"] as const;
export type ExportView = (typeof EXPORT_VIEWS)[number];
const m2 = (minor: number) => (minor / 100).toFixed(2);
const cell = (v: unknown): string => { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (h: string[], rows: unknown[][]) => `﻿${[h, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;

/**
 * COM-1 provider-side transparency. Everything is scoped by the tenant of the signed-in user (never by a request parameter), so a provider can never read another organisation's commission data.
 * Sources: this product's own charges, decisions and disputes, plus the collection runs Kiorex reports (`KiorexCommissionCollection`). Every figure is a sum of rows the same API lists.
 */
@Injectable()
export class CommissionCollectionsService {
  private readonly log = new Logger(CommissionCollectionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── ingest (HMAC marketplace API, Kiorex -> Clinic) ─────────────
  async ingest(b: CollectionBody) {
    if (!b?.runId || !b.orgRef || !b.periodKey || !Number.isFinite(b.version)) throw new BadRequestException("runId, orgRef, periodKey and version are required");
    const ints = [b.claimsCount, b.claimsMinor, b.collectedMinor, b.deductedMinor, b.invoicedMinor, b.paidMinor];
    if (ints.some((n) => !Number.isInteger(n) || n < 0)) throw new BadRequestException("amounts must be non-negative integers (minor units)");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: b.orgRef }, select: { id: true } });
    if (!tenant) throw new NotFoundException("Organization not found");
    const claims = normalizeClaims(b.claims); // COM-3: tolerant of the extra fields (kept when valid, null otherwise) and of anything unknown (dropped)
    // isolation: every claim must be a charge of THIS organisation; a run that names a foreign charge is refused whole
    const ids = claims.map((c) => c.chargeId);
    if (ids.length) {
      const own = await this.prisma.kiorexCommissionCharge.count({ where: { tenantId: tenant.id, id: { in: ids } } });
      if (own !== new Set(ids).size) throw new BadRequestException("The run names a charge that does not belong to this organization");
    }
    const existing = await this.prisma.kiorexCommissionCollection.findUnique({ where: { tenantId_runRef: { tenantId: tenant.id, runRef: b.runId } } });
    if (existing && existing.version >= BigInt(b.version)) return { applied: false, id: existing.id };
    const data = {
      periodKey: b.periodKey, status: b.status, mode: b.mode, modeRequested: b.modeRequested ?? null, fallbackReason: b.fallbackReason ?? null, provider: b.provider ?? null, currency: b.currency,
      claimsCount: b.claimsCount, claimsMinor: b.claimsMinor, collectedMinor: b.collectedMinor, deductedMinor: b.deductedMinor, invoicedMinor: b.invoicedMinor, paidMinor: b.paidMinor,
      invoiceNo: b.invoiceNo ?? null, invoiceDueAt: b.invoiceDueAt ? new Date(b.invoiceDueAt) : null, cutoffAt: b.cutoffAt ? new Date(b.cutoffAt) : null, collectAt: b.collectAt ? new Date(b.collectAt) : null,
      version: BigInt(b.version), claims: claims as unknown as Prisma.InputJsonValue, attempts: (b.attempts ?? []) as Prisma.InputJsonValue, timeline: (b.timeline ?? []) as Prisma.InputJsonValue,
    };
    const row = existing
      ? await this.prisma.kiorexCommissionCollection.update({ where: { id: existing.id }, data })
      : await this.prisma.kiorexCommissionCollection.create({ data: { tenantId: tenant.id, runRef: b.runId, ...data } });
    await this.prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: null, action: "KIOREX_COMMISSION_COLLECTION_RECEIVED", resource: "KiorexCommissionCollection", resourceId: row.id, metadata: { runRef: b.runId, status: b.status, mode: b.mode } } });
    return { applied: true, id: row.id };
  }

  /** COM-2 (Kiorex -> Clinic, HMAC): the organisation's commission rate view. Idempotent, the newest `version` wins; a view that names no known organisation or is malformed is refused whole. */
  async ingestRate(b: CommissionRateViewBody | unknown) {
    const problems = rateViewProblems(b);
    if (problems.length) throw new BadRequestException({ code: "INVALID_RATE_VIEW", problems });
    const v = b as { orgRef: string; product: string; version: string; history: RateHistoryRow[] } & Record<string, unknown>;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: v.orgRef }, select: { id: true } });
    if (!tenant) throw new NotFoundException("Organization not found");
    const existing = await this.prisma.kiorexCommissionRateView.findUnique({ where: { tenantId: tenant.id } });
    if (existing && existing.version >= BigInt(v.version)) return { applied: false };
    // COM-3 (additive, optional): disclosure texts and the counsel STATUS only (never reviewer, document or conditions); anything else Kiorex adds is ignored
    const disclosure = parseDisclosure(v.disclosure); const counsel = parseCounselStatus(v.counsel);
    const data = { product: v.product, version: BigInt(v.version), view: { history: v.history, mode: v.mode ?? null, disclosure, counsel: counsel ? { status: counsel.status } : null } as unknown as Prisma.InputJsonValue };
    if (existing) await this.prisma.kiorexCommissionRateView.update({ where: { id: existing.id }, data });
    else await this.prisma.kiorexCommissionRateView.create({ data: { tenantId: tenant.id, ...data } });
    await this.prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: null, action: "KIOREX_COMMISSION_RATE_RECEIVED", resource: "KiorexCommissionRateView", resourceId: tenant.id, metadata: { version: v.version, rows: v.history.length } } });
    return { applied: true };
  }

  // ───────────── access ─────────────
  async access(user: JwtUser, tenantId: string): Promise<boolean> {
    if (user.tenantId !== tenantId) return false;
    const [tenant, overrides] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { providerSettings: true, market: { select: { providerConfig: true } } } }),
      loadUserMoneyVisibilityOverrides(this.prisma, tenantId, user.userId),
    ]);
    return canViewKiorexCommissions(user, { override: overrides.operations as FinancialVisibilityOverride, adminView: adminViewEnabled(tenant?.providerSettings, tenant?.market?.providerConfig) });
  }
  private async need(user: JwtUser, tenantId: string): Promise<void> {
    if (!(await this.access(user, tenantId))) throw new ForbiddenException("Kiorex commission figures are visible to finance (and to administrators when the organization enables it)");
  }

  private periodWhere(period?: string): { gte: Date; lt: Date } | undefined {
    if (!period) return undefined;
    const mm = /^(\d{4})-(\d{2})$/.exec(period);
    if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) throw new BadRequestException("period must be YYYY-MM");
    return { gte: new Date(Date.UTC(Number(mm[1]), Number(mm[2]) - 1, 1)), lt: new Date(Date.UTC(Number(mm[1]), Number(mm[2]), 1)) };
  }

  /** COM-2: the organisation's effective commission rate now, the default, whether an override applies, and the history (read only; same visibility as the other commission figures). */
  async rate(user: JwtUser, tenantId: string, now = new Date()) {
    await this.need(user, tenantId);
    const row = await this.prisma.kiorexCommissionRateView.findUnique({ where: { tenantId } });
    const stored = (row?.view ?? null) as { history?: RateHistoryRow[]; disclosure?: unknown; counsel?: unknown } | null;
    const disclosure = parseDisclosure(stored?.disclosure); const counsel = parseCounselStatus(stored?.counsel);
    const history = (stored?.history ?? []).slice().sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime() || b.version - a.version);
    const effective = effectiveRateAt(history, now);
    const defaultOnly = effectiveRateAt(history.filter((r) => r.scope === "DEFAULT"), now);
    const upcoming = history.filter((r) => new Date(r.effectiveFrom) > now).sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())[0] ?? null;
    // COM-3: the wording blocks only when Kiorex set wording (EN and/or AR); the counsel status chip only (never reviewer, document, conditions); the override reason only when Kiorex pushed it (it pushes null when hidden)
    return {
      known: !!row, product: row?.product ?? null, state: effective.state, effective, default: defaultOnly, override: effective.source === "OVERRIDE" ? effective : null, inheriting: effective.source !== "OVERRIDE", upcoming, history, receivedAt: row?.updatedAt ?? null,
      disclosure: disclosure && disclosure.wordingSet ? { rateDisclosure: disclosure.rateDisclosure, termsSummary: disclosure.termsSummary } : null,
      counsel: counsel ? { status: counsel.status } : null,
      params: rateParamsOf(effective.spec),
    };
  }

  // ───────────── views ─────────────
  async summary(user: JwtUser, tenantId: string, period?: string) {
    await this.need(user, tenantId);
    const at = this.periodWhere(period);
    const [byStatus, runs, disputed, payouts] = await Promise.all([
      this.prisma.kiorexCommissionCharge.groupBy({ by: ["status"], where: { tenantId, ...(at ? { attendedAt: at } : {}) }, _sum: { amount: true }, _count: true }),
      this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId, ...(period ? { periodKey: { startsWith: period } } : {}) } }),
      this.prisma.commissionDispute.count({ where: { tenantId, status: "OPEN" } }),
      this.prisma.kiorexPayout.aggregate({ where: { tenantId, ...(at ? { paidAt: at } : {}) }, _sum: { commissionDeducted: true } }),
    ]);
    const sum = (k: "collectedMinor" | "deductedMinor" | "invoicedMinor" | "paidMinor" | "claimsMinor") => runs.reduce((s, r) => s + r[k], 0);
    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count, amount: (r._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) })),
      collection: { claims: m2(sum("claimsMinor")), collected: m2(sum("collectedMinor")), deductedFromPayouts: m2(sum("deductedMinor")), invoiced: m2(sum("invoicedMinor")), invoicePaid: m2(sum("paidMinor")), invoiceOpen: m2(sum("invoicedMinor") - sum("paidMinor")) },
      payoutDeductions: (payouts._sum.commissionDeducted ?? new Prisma.Decimal(0)).toFixed(2),
      openDisputes: disputed,
      runs: runs.length,
    };
  }

  async ledger(user: JwtUser, tenantId: string, q: { period?: string; status?: string; page?: number; pageSize?: number }) {
    await this.need(user, tenantId);
    const at = this.periodWhere(q.period); const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 200); const page = Math.max(q.page ?? 1, 1);
    const where: Prisma.KiorexCommissionChargeWhereInput = { tenantId, ...(at ? { attendedAt: at } : {}), ...(q.status ? { status: q.status as never } : {}) };
    const [total, rows] = await Promise.all([this.prisma.kiorexCommissionCharge.count({ where }), this.prisma.kiorexCommissionCharge.findMany({ where, orderBy: { attendedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { commissionDispute: { select: { status: true, reason: true } }, clinician: { select: { displayName: true } } } })]);
    const decisions = rows.length ? await this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, appointmentId: { in: rows.map((r) => r.appointmentId) } }, orderBy: { createdAt: "desc" } }) : [];
    const runs = await this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId }, select: { id: true, runRef: true, periodKey: true, status: true, claims: true } });
    const runOf = new Map<string, { id: string; runRef: string; periodKey: string; status: string; claimStatus?: string }>();
    const claimOf = new Map<string, ClaimView>();
    for (const r of runs) for (const c of normalizeClaims(r.claims)) { runOf.set(c.chargeId, { id: r.id, runRef: r.runRef, periodKey: r.periodKey, status: r.status, claimStatus: c.collectionStatus }); claimOf.set(c.chargeId, c); }
    return {
      total, page, pageSize,
      items: rows.map((r) => {
        const d = decisions.find((x) => x.appointmentId === r.appointmentId);
        return { id: r.id, appointmentId: r.appointmentId, attendedAt: r.attendedAt.toISOString(), clinician: r.clinician.displayName, amount: r.amount.toFixed(2), currency: r.currency, status: r.status, dispute: r.commissionDispute, decision: d ? { id: d.id, kind: d.decision, amount: d.amount?.toFixed(2) ?? null, policyVersion: d.policyVersion, origin: d.origin, reasonCodes: d.reasonCodes, feeBasis: d.feeBasisMinor != null ? m2(d.feeBasisMinor) : null, sponsoredDiscount: d.sponsoredDiscountMinor != null ? m2(d.sponsoredDiscountMinor) : null, basisPolicyVersion: d.basisPolicyVersion } : null, collection: runOf.get(r.id) ?? null, kiorlyInvoiceId: r.kiorlyInvoiceId,
          // COM-3 parity with what Kiorex ops sees for the same charge: how it was paid, the dispute state and deadline, the rate source and the rate snapshot that priced it
          tender: claimOf.get(r.id)?.tender ?? asTender(r.tender), disputeStatus: claimOf.get(r.id)?.disputeStatus ?? r.commissionDispute?.status ?? null, disputeDeadline: claimOf.get(r.id)?.disputeDeadline ?? r.disputeDeadline.toISOString(),
          rateSource: claimOf.get(r.id)?.rateSource ?? r.rateSource ?? null, rateSnapshot: claimOf.get(r.id)?.rateSnapshot ?? null };
      }),
    };
  }

  async collections(user: JwtUser, tenantId: string) {
    await this.need(user, tenantId);
    const rows = await this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId }, orderBy: { periodKey: "desc" }, take: 100 });
    return { items: rows.map((r) => this.mapRun(r)) };
  }

  async collection(user: JwtUser, tenantId: string, id: string) {
    await this.need(user, tenantId);
    const r = await this.prisma.kiorexCommissionCollection.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException("Collection not found");
    const claims = r.claims as Array<{ chargeId: string }>;
    const charges = await this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, id: { in: claims.map((c) => c.chargeId) } }, select: { id: true, appointmentId: true, amount: true, status: true, attendedAt: true } });
    const settled = r.collectedMinor + r.deductedMinor + r.invoicedMinor;
    return { ...this.mapRun(r), claims: r.claims, attempts: r.attempts, timeline: r.timeline, charges: charges.map((c) => ({ id: c.id, appointmentId: c.appointmentId, amount: c.amount.toFixed(2), status: c.status, attendedAt: c.attendedAt.toISOString() })), balanced: settled === r.claimsMinor || ["PLANNED", "COLLECTING", "RETRYING"].includes(r.status) };
  }
  private mapRun(r: { id: string; runRef: string; periodKey: string; status: string; mode: string; modeRequested: string | null; fallbackReason: string | null; provider: string | null; currency: string; claimsCount: number; claimsMinor: number; collectedMinor: number; deductedMinor: number; invoicedMinor: number; paidMinor: number; invoiceNo: string | null; invoiceDueAt: Date | null; updatedAt: Date }) {
    return { id: r.id, runRef: r.runRef, periodKey: r.periodKey, status: r.status, mode: r.mode, modeRequested: r.modeRequested, fallbackReason: r.fallbackReason, provider: r.provider, currency: r.currency, claimsCount: r.claimsCount, claims: m2(r.claimsMinor), collected: m2(r.collectedMinor), deducted: m2(r.deductedMinor), invoiced: m2(r.invoicedMinor), paid: m2(r.paidMinor), open: m2(r.invoicedMinor - r.paidMinor), invoiceNo: r.invoiceNo, invoiceDueAt: r.invoiceDueAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString() };
  }

  async deductions(user: JwtUser, tenantId: string) {
    await this.need(user, tenantId);
    const rows = await this.prisma.kiorexPayout.findMany({ where: { tenantId, commissionDeducted: { gt: 0 } }, orderBy: { paidAt: "desc" }, take: 100 });
    return { items: rows.map((p) => ({ payoutRef: p.payoutRef, paidAt: p.paidAt.toISOString(), gross: p.amount.add(p.commissionDeducted).toFixed(2), cash: p.amount.toFixed(2), commissionDeducted: p.commissionDeducted.toFixed(2), currency: p.currency })) };
  }

  async disputes(user: JwtUser, tenantId: string) {
    await this.need(user, tenantId);
    const rows = await this.prisma.commissionDispute.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100, include: { charge: { select: { amount: true, currency: true, appointmentId: true, status: true } } } });
    return { items: rows.map((d) => ({ id: d.id, chargeId: d.chargeId, appointmentId: d.charge.appointmentId, reason: d.reason, status: d.status, resolution: d.resolution, amount: d.charge.amount.toFixed(2), currency: d.charge.currency, chargeStatus: d.charge.status, createdAt: d.createdAt.toISOString(), resolvedAt: d.resolvedAt?.toISOString() ?? null })) };
  }

  /** Status timeline of one charge: audit rows about the charge and its dispute plus the collection run events that include it. */
  async chargeTimeline(user: JwtUser, tenantId: string, chargeId: string) {
    await this.need(user, tenantId);
    const c = await this.prisma.kiorexCommissionCharge.findFirst({ where: { id: chargeId, tenantId }, include: { commissionDispute: true } });
    if (!c) throw new NotFoundException("Charge not found");
    const audits = await this.prisma.auditLog.findMany({ where: { tenantId, OR: [{ resource: "KiorexCommissionCharge", resourceId: chargeId }, ...(c.commissionDispute ? [{ resource: "CommissionDispute", resourceId: c.commissionDispute.id }] : [])] }, orderBy: { createdAt: "asc" }, select: { action: true, createdAt: true } });
    const runs = (await this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId } })).filter((r) => (r.claims as Array<{ chargeId: string }>).some((x) => x.chargeId === chargeId));
    const events = [
      ...audits.map((a) => ({ at: a.createdAt.toISOString(), source: "charge", event: a.action })),
      ...runs.flatMap((r) => (r.timeline as Array<{ at: string; event: string }>).map((t) => ({ at: t.at, source: `collection:${r.periodKey}`, event: t.event }))),
    ].sort((a, b) => a.at.localeCompare(b.at));
    return { chargeId, status: c.status, events };
  }

  // ───────────── exports (audited) ─────────────
  async exportCsv(user: JwtUser, tenantId: string, view: ExportView, period?: string) {
    await this.need(user, tenantId);
    if (!EXPORT_VIEWS.includes(view)) throw new BadRequestException("Unknown export view");
    let header: string[]; let rows: unknown[][];
    if (view === "ledger") { const l = await this.ledger(user, tenantId, { period, pageSize: 200 }); header = ["appointment", "attendedAt", "clinician", "amount", "currency", "status", "decisionKind", "decisionAmount", "policyVersion", "feeBasis", "sponsoredDiscount", "basisPolicyVersion", "collectionPeriod", "collectionStatus", "dispute", "tender", "disputeDeadline", "rateSource"]; rows = l.items.map((r) => [r.appointmentId, r.attendedAt, r.clinician, r.amount, r.currency, r.status, r.decision?.kind, r.decision?.amount, r.decision?.policyVersion, r.decision?.feeBasis, r.decision?.sponsoredDiscount, r.decision?.basisPolicyVersion, r.collection?.periodKey, r.collection?.claimStatus, r.dispute?.status, r.tender, r.disputeDeadline, r.rateSource]); }
    else if (view === "collections") { const c = await this.collections(user, tenantId); header = ["period", "status", "mode", "fallbackReason", "provider", "currency", "claims", "collected", "deducted", "invoiced", "paid", "open", "invoiceNo", "invoiceDueAt"]; rows = c.items.map((r) => [r.periodKey, r.status, r.mode, r.fallbackReason, r.provider, r.currency, r.claims, r.collected, r.deducted, r.invoiced, r.paid, r.open, r.invoiceNo, r.invoiceDueAt]); }
    else if (view === "deductions") { const d = await this.deductions(user, tenantId); header = ["payoutRef", "paidAt", "gross", "cash", "commissionDeducted", "currency"]; rows = d.items.map((r) => [r.payoutRef, r.paidAt, r.gross, r.cash, r.commissionDeducted, r.currency]); }
    else if (view === "disputes") { const d = await this.disputes(user, tenantId); header = ["appointment", "reason", "status", "resolution", "amount", "currency", "createdAt", "resolvedAt"]; rows = d.items.map((r) => [r.appointmentId, r.reason, r.status, r.resolution, r.amount, r.currency, r.createdAt, r.resolvedAt]); }
    else { const t = await this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId }, orderBy: { periodKey: "asc" } }); header = ["period", "at", "event", "by"]; rows = t.flatMap((r) => (r.timeline as Array<{ at: string; event: string; by?: string }>).map((e) => [r.periodKey, e.at, e.event, e.by])); }
    await this.auditExport(user, tenantId, view, "CSV", rows.length, period);
    return { filename: `kiorex-commissions-${view}${period ? `-${period}` : ""}.csv`, body: csv(header, rows) };
  }

  /** Bilingual (EN + AR RTL) statement PDF of one month: totals, ledger, collections, deductions. */
  async statementPdf(user: JwtUser, tenantId: string, period: string) {
    await this.need(user, tenantId);
    const [s, l, c, d] = await Promise.all([this.summary(user, tenantId, period), this.ledger(user, tenantId, { period, pageSize: 200 }), this.collections(user, tenantId), this.deductions(user, tenantId)]);
    const L = { en: { title: "Kiorex commissions statement", period: "Period", claims: "Commission in collection runs", collected: "Charged to saved method", deducted: "Kept from payouts", invoiced: "Invoiced", paid: "Invoice paid", open: "Open", charges: "Charges", date: "Date", status: "Status", amount: "Amount", runs: "Collections", mode: "Mode", none: "Nothing in this period.", disputes: "Open disputes" }, ar: { title: "كشف عمولات كيوركس", period: "الفترة", claims: "العمولة ضمن التحصيلات", collected: "محصّل من الوسيلة المحفوظة", deducted: "مخصوم من التحويلات", invoiced: "مفوتر", paid: "فاتورة مدفوعة", open: "مفتوح", charges: "الرسوم", date: "التاريخ", status: "الحالة", amount: "المبلغ", runs: "التحصيلات", mode: "الطريقة", none: "لا شيء في هذه الفترة.", disputes: "نزاعات مفتوحة" } } as const;
    const section = (lang: "en" | "ar") => {
      const T = L[lang]; const w = [3, 3, 3];
      const rows: PdfRow[] = [{ kind: "text", text: T.title, size: 16, bold: true }, { kind: "pair", label: T.period, value: period }, { kind: "rule" },
        { kind: "pair", label: T.claims, value: s.collection.claims }, { kind: "pair", label: T.collected, value: s.collection.collected }, { kind: "pair", label: T.deducted, value: s.collection.deductedFromPayouts }, { kind: "pair", label: T.invoiced, value: s.collection.invoiced }, { kind: "pair", label: T.paid, value: s.collection.invoicePaid }, { kind: "pair", label: T.open, value: s.collection.invoiceOpen, bold: true }, { kind: "pair", label: T.disputes, value: String(s.openDisputes) },
        { kind: "gap" }, { kind: "text", text: T.charges, size: 11, bold: true }];
      if (!l.items.length) rows.push({ kind: "text", text: T.none, size: 9 }); else { rows.push({ kind: "columns", cells: [T.date, T.status, T.amount], widths: w, size: 9, bold: true }); for (const r of l.items) rows.push({ kind: "columns", cells: [r.attendedAt.slice(0, 10), r.status, `${r.amount} ${r.currency}`], widths: w, size: 9 }); }
      rows.push({ kind: "gap" }, { kind: "text", text: T.runs, size: 11, bold: true });
      const runs = c.items.filter((r) => r.periodKey.startsWith(period));
      if (!runs.length) rows.push({ kind: "text", text: T.none, size: 9 }); else for (const r of runs) rows.push({ kind: "pair", label: `${r.periodKey} · ${r.status} · ${r.mode}`, value: `${r.claims} ${r.currency}`, size: 9 });
      for (const p of d.items.filter((x) => x.paidAt.startsWith(period))) rows.push({ kind: "pair", label: `${p.payoutRef}`, value: `-${p.commissionDeducted} ${p.currency}`, size: 9 });
      return { direction: (lang === "ar" ? "rtl" : "ltr") as "rtl" | "ltr", rows };
    };
    const pdf = buildBilingualPdf([section("en"), section("ar")]);
    await this.auditExport(user, tenantId, "statement", "PDF", l.items.length, period);
    return { pdf, filename: `kiorex-commissions-statement-${period}.pdf` };
  }

  // ───────────── COM-3 settlement statement ─────────────
  /** `real` fetches the statement from the Kiorex statement API with the partner request HMAC; `mock` (default, workspace rule) mirrors it from this product's own rows. */
  private statementMode(): "real" | "mock" { return (process.env.KIOREX_STATEMENT_MODE ?? "mock").toLowerCase() === "real" ? "real" : "mock"; }

  private async fetchKiorex(tenantId: string, tail: string, range: { from: Date; to: Date }, accept: string): Promise<Response> {
    const base = kiorexApiBase(); const secret = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET?.trim();
    if (!base || !secret) throw new ServiceUnavailableException({ code: "STATEMENT_NOT_CONFIGURED", message: "The Kiorex statement is not connected yet" });
    const url = new URL(`${base}/partner/commissions/settlement-statement${tail}`);
    url.searchParams.set("from", range.from.toISOString()); url.searchParams.set("to", range.to.toISOString());
    // the signature covers the FULL request path (without the query), exactly as the partner endpoints of Kiorex verify it (same scheme as the rate view and the evidence call)
    const headers = { ...signEvidenceRequest({ secret, clientKey: process.env.KIOREX_EVIDENCE_CLIENT_KEY?.trim() || process.env.KIOREX_MARKETPLACE_CLIENT_KEY?.trim() || "kx_dev_client", method: "GET", path: url.pathname, orgRef: tenantId }), accept };
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new ServiceUnavailableException({ code: "STATEMENT_UNAVAILABLE", message: `Kiorex answered ${res.status}` });
      return res;
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.log.warn(`statement fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException({ code: "STATEMENT_UNAVAILABLE", message: "The Kiorex statement could not be reached" });
    }
  }

  /** One period (YYYY-MM, default the current month): the same figures Kiorex finance sees for this organisation. Finance, owner and (when enabled) administrators only; never another organisation's. */
  async statement(user: JwtUser, tenantId: string, period?: string): Promise<StatementView & { period: StatementView["period"] & { key: string } }> {
    await this.need(user, tenantId);
    const r = periodRange(period); if (!r) throw new BadRequestException("period must be YYYY-MM");
    const s = await this.buildStatement(tenantId, r);
    return { ...s, period: { ...s.period, key: r.key } };
  }

  private async buildStatement(tenantId: string, r: { from: Date; to: Date }): Promise<StatementView> {
    if (this.statementMode() === "real") {
      const body = await (await this.fetchKiorex(tenantId, "", r, "application/json")).json().catch(() => null);
      const v = normalizeStatement(body, "KIOREX", { orgRef: tenantId, from: r.from, to: r.to });
      if (!v) throw new ServiceUnavailableException({ code: "STATEMENT_UNAVAILABLE", message: "Kiorex sent an unreadable statement" });
      return { ...v, orgRef: tenantId };
    }
    const [charges, runs, payouts, tenant] = await Promise.all([
      this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, createdAt: { gte: r.from, lt: r.to } }, select: { id: true, amount: true, status: true, tender: true, currency: true } }),
      this.prisma.kiorexCommissionCollection.findMany({ where: { tenantId }, select: { claims: true } }),
      this.prisma.kiorexPayout.findMany({ where: { tenantId, paidAt: { gte: r.from, lt: r.to } }, orderBy: { paidAt: "asc" } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrency: true } }),
    ]);
    const ids = new Set(charges.map((c) => c.id));
    const claims = runs.flatMap((x) => normalizeClaims(x.claims)).filter((c) => ids.has(c.chargeId));
    const toMinor = (d: Prisma.Decimal) => Math.round(Number(d) * 100);
    return localStatement({
      orgRef: tenantId, from: r.from, to: r.to, currency: charges[0]?.currency ?? payouts[0]?.currency ?? tenant?.baseCurrency ?? "EGP",
      charges: charges.map((c) => ({ amountMinor: toMinor(c.amount), status: c.status, tender: c.tender })),
      claims: claims.map((c) => ({ collectedMinor: c.collectedMinor ?? 0, disputeStatus: c.disputeStatus, tender: c.tender, chargeStatus: c.chargeStatus })),
      payouts: payouts.map((p) => ({ payoutRef: p.payoutRef, paidAt: p.paidAt, cashMinor: toMinor(p.amount), commissionDeductedMinor: toMinor(p.commissionDeducted) })),
    });
  }

  /** CSV of the statement: in real mode Kiorex's own export through the Clinic API, in mock mode the same rows built here. Audited. */
  async statementExport(user: JwtUser, tenantId: string, period?: string) {
    await this.need(user, tenantId);
    const r = periodRange(period); if (!r) throw new BadRequestException("period must be YYYY-MM");
    let out: { filename: string; body: string; rows: number };
    if (this.statementMode() === "real") {
      const res = await this.fetchKiorex(tenantId, "/export", r, "text/csv");
      const body = await res.text();
      out = { filename: `settlement-${tenantId}-${r.key}.csv`, body: body.startsWith("﻿") ? body : `﻿${body}`, rows: Math.max(0, body.split(/\r?\n/).filter(Boolean).length - 1) };
    } else out = statementCsv(await this.buildStatement(tenantId, r));
    await this.auditExport(user, tenantId, "settlement-statement", "CSV", out.rows, r.key);
    return out;
  }

  private async auditExport(user: JwtUser, tenantId: string, view: string, format: "CSV" | "PDF", rows: number, period?: string) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId: user.userId, action: "KIOREX_COMMISSION_EXPORT", resource: "KiorexCommission", resourceId: view, metadata: { format, rows, period: period ?? null } } });
  }
}
