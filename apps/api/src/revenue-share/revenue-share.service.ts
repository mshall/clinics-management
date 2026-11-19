import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma, RevenueStatus, TransferVerificationStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { buildBilingualPdf, type PdfRow } from "../billing-platform/bilingual-pdf";
import { canApproveRefunds } from "../billing/patient-money";
import { hasAnyRole } from "../common/effective-roles";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import {
  type Adjustment,
  computeStatement,
  currentPeriodKey,
  type Payout,
  periodRange,
  RULE_TYPES,
  type ShareLine,
  type ShareRule,
  type StatementTotals,
} from "./revenue-share-engine";

export const STATEMENT_STATUS = { DRAFT: "DRAFT", APPROVED: "APPROVED", PAID: "PAID" } as const;

export type RuleBody = {
  clinicianId?: string | null;
  clinicId?: string | null;
  appointmentTypeId?: string | null;
  revenueCategory?: string | null;
  payerKey?: string | null;
  ruleType: string;
  percent?: number | null;
  fixedAmount?: number | null;
  priority?: number;
  label?: string | null;
};

type StatementRow = Prisma.DoctorStatementGetPayload<object>;

/** MN-02 — doctor revenue-share engine & statements. */
@Injectable()
export class RevenueShareService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(user: JwtUser) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can manage revenue share");
  }

  private viewerScope(user: JwtUser): { all: boolean; clinicianId: string } {
    if (canApproveRefunds(user)) return { all: true, clinicianId: user.userId };
    if (hasAnyRole(user, [UserRole.PHYSICIAN])) return { all: false, clinicianId: user.userId };
    throw new ForbiddenException("Statements are visible to doctors (their own) and to owners / finance");
  }

  private async context(tenantId: string, periodKey: string | undefined) {
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const key = periodKey?.trim() || currentPeriodKey(new Date(), market.timezone);
    try {
      return { periodKey: key, currency: market.currency, timeZone: market.timezone, range: periodRange(key, market.timezone) };
    } catch {
      throw new BadRequestException({ message: "period must be YYYY-MM", code: "PERIOD_INVALID" });
    }
  }

  private async rules(tenantId: string): Promise<ShareRule[]> {
    const rows = await this.prisma.commissionRule.findMany({ where: { tenantId, active: true } });
    return rows.map((r) => ({
      id: r.id,
      clinicianId: r.clinicianId,
      clinicId: r.clinicId,
      appointmentTypeId: r.appointmentTypeId,
      revenueCategory: r.revenueCategory,
      payerKey: r.payerKey,
      ruleType: r.ruleType,
      percent: r.percent != null ? Number(r.percent) : null,
      fixedAmount: r.fixedAmount != null ? Number(r.fixedAmount) : null,
      roomRental: r.roomRental,
      priority: r.priority,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Collected revenue in the period: POSTED rows (refunds included as negatives), excluding rejected transfers.
   * Doctor = encounter clinician, else appointment clinician, else operation clinician.
   */
  async collectedLines(tenantId: string, range: { start: Date; end: Date }) {
    const rows = await this.prisma.revenueEntry.findMany({
      where: {
        tenantId,
        status: RevenueStatus.POSTED,
        postedAt: { gte: range.start, lt: range.end },
        NOT: { transferVerificationStatus: TransferVerificationStatus.REJECTED },
      },
      select: {
        id: true,
        clinicId: true,
        category: true,
        grossAmount: true,
        netAmount: true,
        appointmentId: true,
        encounterId: true,
        operationId: true,
        encounter: { select: { clinicianId: true } },
        appointment: { select: { clinicianId: true, appointmentTypeId: true } },
        operation: { select: { clinicianId: true } },
      },
    });
    const kiorexPaid = new Set(
      (
        await this.prisma.billingPaymentAllocation.findMany({
          where: { revenueEntryId: { in: rows.map((r) => r.id) }, method: PaymentMethod.KIOREX_PAY },
          select: { revenueEntryId: true },
        })
      ).map((a) => a.revenueEntryId!),
    );
    const lines: ShareLine[] = [];
    const unattributed: { id: string; net: number }[] = [];
    for (const r of rows) {
      const clinicianId = r.encounter?.clinicianId ?? r.appointment?.clinicianId ?? r.operation?.clinicianId ?? null;
      const net = Number(r.netAmount);
      if (!clinicianId) {
        unattributed.push({ id: r.id, net });
        continue;
      }
      lines.push({
        id: r.id,
        clinicianId,
        clinicId: r.clinicId,
        appointmentTypeId: r.appointment?.appointmentTypeId ?? null,
        category: r.category,
        payerKey: kiorexPaid.has(r.id) ? "KIOREX_PAY" : "PATIENT",
        visitKey: r.encounterId ?? r.appointmentId ?? r.operationId ?? r.id,
        gross: Number(r.grossAmount),
        net,
      });
    }
    return { lines, unattributed, totalNet: rows.reduce((s, r) => s + Number(r.netAmount), 0) };
  }

  /** GET /revenue-share/statements?period= — drafts are recomputed on read; approved/paid stay locked. */
  async statements(tenantId: string, user: JwtUser, period?: string) {
    const scope = this.viewerScope(user);
    const ctx = await this.context(tenantId, period);
    const [{ lines }, rules, existing] = await Promise.all([
      this.collectedLines(tenantId, ctx.range),
      this.rules(tenantId),
      this.prisma.doctorStatement.findMany({ where: { tenantId, periodKey: ctx.periodKey } }),
    ]);
    const byDoctor = new Map<string, ShareLine[]>();
    for (const l of lines) byDoctor.set(l.clinicianId, [...(byDoctor.get(l.clinicianId) ?? []), l]);
    const ids = new Set<string>([...byDoctor.keys(), ...existing.map((s) => s.clinicianId)]);
    const visible = [...ids].filter((id) => scope.all || id === scope.clinicianId);
    const out: StatementRow[] = [];
    for (const clinicianId of visible) {
      const prev = existing.find((s) => s.clinicianId === clinicianId);
      if (prev && prev.status !== STATEMENT_STATUS.DRAFT) {
        out.push(prev);
        continue;
      }
      const totals = computeStatement(
        byDoctor.get(clinicianId) ?? [],
        rules,
        (prev?.adjustmentsJson as Adjustment[] | undefined) ?? [],
        (prev?.payoutsJson as Payout[] | undefined) ?? [],
      );
      out.push(
        await this.prisma.doctorStatement.upsert({
          where: { tenantId_clinicianId_periodKey: { tenantId, clinicianId, periodKey: ctx.periodKey } },
          create: { tenantId, clinicianId, periodKey: ctx.periodKey, currency: ctx.currency, totalsJson: totals as unknown as Prisma.InputJsonValue },
          update: { totalsJson: totals as unknown as Prisma.InputJsonValue },
        }),
      );
    }
    const names = await this.clinicianNames(tenantId, out.map((s) => s.clinicianId));
    return {
      periodKey: ctx.periodKey,
      currency: ctx.currency,
      canManage: scope.all,
      statements: out
        .map((s) => this.serialize(s, names.get(s.clinicianId) ?? s.clinicianId))
        .sort((a, b) => a.clinicianName.localeCompare(b.clinicianName)),
    };
  }

  /** Every collected revenue row in the period is either on exactly one doctor statement or unattributed. */
  async reconciliation(tenantId: string, user: JwtUser, period?: string) {
    this.assertManager(user);
    const ctx = await this.context(tenantId, period);
    const { lines, unattributed, totalNet } = await this.collectedLines(tenantId, ctx.range);
    const attributed = lines.reduce((s, l) => s + l.net, 0);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      periodKey: ctx.periodKey,
      revenueNet: r2(totalNet),
      attributedNet: r2(attributed),
      unattributedNet: r2(unattributed.reduce((s, u) => s + u.net, 0)),
      unattributedCount: unattributed.length,
      balanced: Math.abs(totalNet - attributed - unattributed.reduce((s, u) => s + u.net, 0)) < 0.005,
    };
  }

  private async loadForManager(tenantId: string, user: JwtUser, id: string) {
    this.assertManager(user);
    const s = await this.prisma.doctorStatement.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException("Statement not found");
    return s;
  }

  async addAdjustment(tenantId: string, user: JwtUser, id: string, body: { amount: number; note: string }) {
    const s = await this.loadForManager(tenantId, user, id);
    if (s.status !== STATEMENT_STATUS.DRAFT) throw new BadRequestException({ message: "Statement is locked", code: "STATEMENT_LOCKED" });
    const amount = Math.round(Number(body?.amount) * 100) / 100;
    const note = body?.note?.trim();
    if (!Number.isFinite(amount) || amount === 0) throw new BadRequestException("amount must be a non-zero number");
    if (!note) throw new BadRequestException("A note is required");
    const adjustments = [...((s.adjustmentsJson as Adjustment[]) ?? []), { amount, note: note.slice(0, 300), at: new Date().toISOString(), byUserId: user.userId }];
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorStatement.update({ where: { id }, data: { adjustmentsJson: adjustments as unknown as Prisma.InputJsonValue } });
      await this.audit(tx, tenantId, user.userId, id, "DOCTOR_STATEMENT_ADJUSTED", { amount, note, periodKey: s.periodKey, clinicianId: s.clinicianId });
    });
    return this.recomputeOne(tenantId, id);
  }

  /** Owner approves: totals are recomputed one last time and locked. */
  async approve(tenantId: string, user: JwtUser, id: string) {
    const s = await this.loadForManager(tenantId, user, id);
    if (s.status !== STATEMENT_STATUS.DRAFT) throw new BadRequestException({ message: "Only a draft can be approved", code: "STATEMENT_NOT_DRAFT" });
    await this.recomputeOne(tenantId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.doctorStatement.updateMany({
        where: { id, status: STATEMENT_STATUS.DRAFT },
        data: { status: STATEMENT_STATUS.APPROVED, approvedBy: user.userId, approvedAt: new Date() },
      });
      if (r.count === 0) throw new BadRequestException({ message: "Only a draft can be approved", code: "STATEMENT_NOT_DRAFT" });
      const row = await tx.doctorStatement.findUniqueOrThrow({ where: { id } });
      const totals = row.totalsJson as unknown as StatementTotals;
      await this.audit(tx, tenantId, user.userId, id, "DOCTOR_STATEMENT_APPROVED", {
        periodKey: row.periodKey,
        clinicianId: row.clinicianId,
        doctorShare: totals.doctorShare,
        netPayable: totals.netPayable,
      });
      return row;
    });
    const names = await this.clinicianNames(tenantId, [updated.clinicianId]);
    return this.serialize(updated, names.get(updated.clinicianId) ?? updated.clinicianId);
  }

  async markPaid(tenantId: string, user: JwtUser, id: string, body: { method?: string; reference?: string; amount?: number }) {
    const s = await this.loadForManager(tenantId, user, id);
    if (s.status !== STATEMENT_STATUS.APPROVED) {
      throw new BadRequestException({ message: "Approve the statement before paying it", code: "STATEMENT_NOT_APPROVED" });
    }
    const totals = s.totalsJson as unknown as StatementTotals;
    const amount = Math.round(Number(body?.amount ?? totals.netPayable) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException("amount must be zero or more");
    const method = (body?.method?.trim() || "TRANSFER").toUpperCase().slice(0, 30);
    const payout: Payout = { amount, method, reference: body?.reference?.trim()?.slice(0, 120) || null, at: new Date().toISOString(), byUserId: user.userId };
    const payouts = [...((s.payoutsJson as Payout[]) ?? []), payout];
    const nextTotals: StatementTotals = {
      ...totals,
      payouts: Math.round((totals.payouts + amount) * 100) / 100,
      netPayable: Math.round((totals.netPayable - amount) * 100) / 100,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.doctorStatement.updateMany({
        where: { id, status: STATEMENT_STATUS.APPROVED },
        data: {
          status: STATEMENT_STATUS.PAID,
          paidAt: new Date(),
          payoutsJson: payouts as unknown as Prisma.InputJsonValue,
          totalsJson: nextTotals as unknown as Prisma.InputJsonValue,
        },
      });
      if (r.count === 0) throw new BadRequestException({ message: "Approve the statement before paying it", code: "STATEMENT_NOT_APPROVED" });
      await this.audit(tx, tenantId, user.userId, id, "DOCTOR_STATEMENT_PAID", { ...payout, periodKey: s.periodKey, clinicianId: s.clinicianId });
      return tx.doctorStatement.findUniqueOrThrow({ where: { id } });
    });
    const names = await this.clinicianNames(tenantId, [updated.clinicianId]);
    return this.serialize(updated, names.get(updated.clinicianId) ?? updated.clinicianId);
  }

  private async recomputeOne(tenantId: string, id: string) {
    const s = await this.prisma.doctorStatement.findFirstOrThrow({ where: { id, tenantId } });
    if (s.status !== STATEMENT_STATUS.DRAFT) return s;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const range = periodRange(s.periodKey, market.timezone);
    const [{ lines }, rules] = await Promise.all([this.collectedLines(tenantId, range), this.rules(tenantId)]);
    const totals = computeStatement(
      lines.filter((l) => l.clinicianId === s.clinicianId),
      rules,
      (s.adjustmentsJson as Adjustment[]) ?? [],
      (s.payoutsJson as Payout[]) ?? [],
    );
    return this.prisma.doctorStatement.update({ where: { id }, data: { totalsJson: totals as unknown as Prisma.InputJsonValue } });
  }

  async pdf(tenantId: string, user: JwtUser, id: string): Promise<{ pdf: Buffer; filename: string }> {
    const scope = this.viewerScope(user);
    const s = await this.prisma.doctorStatement.findFirst({ where: { id, tenantId } });
    if (!s || (!scope.all && s.clinicianId !== scope.clinicianId)) throw new NotFoundException("Statement not found");
    const fresh = s.status === STATEMENT_STATUS.DRAFT ? await this.recomputeOne(tenantId, id) : s;
    const t = fresh.totalsJson as unknown as StatementTotals;
    const [names, tenant] = await Promise.all([
      this.clinicianNames(tenantId, [s.clinicianId]),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    const money = (n: number) => `${n.toFixed(2)} ${fresh.currency}`;
    const doctor = names.get(s.clinicianId) ?? s.clinicianId;
    const statusAr: Record<string, string> = { DRAFT: "مسودة", APPROVED: "معتمد", PAID: "مدفوع" };
    const pairs = (labels: Record<string, string>): PdfRow[] => [
      { kind: "pair", label: labels.visits!, value: String(t.visits) },
      { kind: "pair", label: labels.collections!, value: money(t.collectedNet) },
      { kind: "pair", label: labels.doctorShare!, value: money(t.doctorShareFromLines) },
      { kind: "pair", label: labels.roomRental!, value: money(t.roomRental) },
      { kind: "pair", label: labels.clinicShare!, value: money(t.clinicShare) },
      { kind: "pair", label: labels.adjustments!, value: money(t.adjustments) },
      { kind: "pair", label: labels.payouts!, value: money(t.payouts) },
      { kind: "rule" },
      { kind: "pair", label: labels.netPayable!, value: money(t.netPayable), bold: true },
    ];
    const en: PdfRow[] = [
      { kind: "text", text: tenant?.name ?? "", size: 16, bold: true },
      { kind: "text", text: `Doctor statement — ${s.periodKey}`, size: 13, bold: true },
      { kind: "pair", label: "Doctor", value: doctor },
      { kind: "pair", label: "Status", value: fresh.status },
      { kind: "rule" },
      ...pairs({
        visits: "Visits",
        collections: "Collections (net)",
        doctorShare: "Doctor share",
        roomRental: "Room rental",
        clinicShare: "Clinic share",
        adjustments: "Adjustments",
        payouts: "Payouts",
        netPayable: "Net payable to doctor",
      }),
    ];
    const ar: PdfRow[] = [
      { kind: "text", text: tenant?.name ?? "", size: 16, bold: true },
      { kind: "text", text: `كشف حساب الطبيب — ${s.periodKey}`, size: 13, bold: true },
      { kind: "pair", label: "الطبيب", value: doctor },
      { kind: "pair", label: "الحالة", value: statusAr[fresh.status] ?? fresh.status },
      { kind: "rule" },
      ...pairs({
        visits: "الزيارات",
        collections: "المحصّل (صافي)",
        doctorShare: "حصة الطبيب",
        roomRental: "إيجار العيادة",
        clinicShare: "حصة العيادة",
        adjustments: "التسويات",
        payouts: "المدفوع للطبيب",
        netPayable: "صافي المستحق للطبيب",
      }),
    ];
    return {
      pdf: buildBilingualPdf([
        { direction: "ltr", rows: en },
        { direction: "rtl", rows: ar },
      ]),
      filename: `doctor-statement-${s.periodKey}.pdf`,
    };
  }

  // ─── Rules ───────────────────────────────────────────────────────────────

  async listRules(tenantId: string, user: JwtUser) {
    this.assertManager(user);
    const rows = await this.prisma.commissionRule.findMany({
      where: { tenantId, active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({ ...r, percent: r.percent != null ? Number(r.percent) : null, fixedAmount: r.fixedAmount != null ? Number(r.fixedAmount) : null }));
  }

  private validateRule(body: RuleBody) {
    const ruleType = body?.ruleType?.trim().toUpperCase();
    if (!ruleType || !(RULE_TYPES as readonly string[]).includes(ruleType)) {
      throw new BadRequestException({ message: "ruleType must be PERCENT, FIXED_PER_VISIT or ROOM_RENTAL", code: "RULE_TYPE_INVALID" });
    }
    const percent = body.percent != null ? Number(body.percent) : null;
    const fixed = body.fixedAmount != null ? Number(body.fixedAmount) : null;
    if (ruleType === "PERCENT" && (percent == null || !(percent >= 0 && percent <= 100))) {
      throw new BadRequestException({ message: "percent must be 0–100", code: "RULE_PERCENT_INVALID" });
    }
    if (ruleType !== "PERCENT" && (fixed == null || !(fixed >= 0))) {
      throw new BadRequestException({ message: "fixedAmount must be zero or more", code: "RULE_AMOUNT_INVALID" });
    }
    if (ruleType === "ROOM_RENTAL" && (body.appointmentTypeId || body.revenueCategory || body.payerKey)) {
      throw new BadRequestException({ message: "Room rental applies per doctor per period, not per service", code: "RULE_RENTAL_SCOPE" });
    }
    const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    return {
      ruleType,
      percent: ruleType === "PERCENT" ? new Prisma.Decimal(String(percent)) : null,
      fixedAmount: ruleType !== "PERCENT" ? new Prisma.Decimal(String(fixed)) : null,
      roomRental: ruleType === "ROOM_RENTAL",
      clinicianId: clean(body.clinicianId),
      clinicId: clean(body.clinicId),
      appointmentTypeId: clean(body.appointmentTypeId),
      revenueCategory: clean(body.revenueCategory)?.toUpperCase() ?? null,
      payerKey: clean(body.payerKey)?.toUpperCase() ?? null,
      priority: Number.isInteger(body.priority) ? body.priority! : 0,
      label: clean(body.label)?.slice(0, 120) ?? null,
    };
  }

  async createRule(tenantId: string, user: JwtUser, body: RuleBody) {
    this.assertManager(user);
    const data = this.validateRule(body);
    if (data.clinicianId) {
      const u = await this.prisma.user.findFirst({ where: { id: data.clinicianId, tenantId }, select: { id: true } });
      if (!u) throw new NotFoundException("Doctor not found");
    }
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({ data: { tenantId, ...data } });
      await this.audit(tx, tenantId, user.userId, rule.id, "REVENUE_SHARE_RULE_CREATED", { ...data, percent: body.percent ?? null, fixedAmount: body.fixedAmount ?? null }, "CommissionRule");
      return rule;
    });
  }

  async deactivateRule(tenantId: string, user: JwtUser, id: string) {
    this.assertManager(user);
    const rule = await this.prisma.commissionRule.findFirst({ where: { id, tenantId, active: true } });
    if (!rule) throw new NotFoundException("Rule not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.commissionRule.update({ where: { id }, data: { active: false } });
      await this.audit(tx, tenantId, user.userId, id, "REVENUE_SHARE_RULE_DEACTIVATED", { ruleType: rule.ruleType }, "CommissionRule");
    });
    return { ok: true };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async clinicianNames(tenantId: string, ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private serialize(s: StatementRow, clinicianName: string) {
    return {
      id: s.id,
      clinicianId: s.clinicianId,
      clinicianName,
      periodKey: s.periodKey,
      currency: s.currency,
      status: s.status,
      totals: s.totalsJson as unknown as StatementTotals,
      adjustments: (s.adjustmentsJson as Adjustment[]) ?? [],
      payouts: (s.payoutsJson as Payout[]) ?? [],
      approvedBy: s.approvedBy,
      approvedAt: s.approvedAt?.toISOString() ?? null,
      paidAt: s.paidAt?.toISOString() ?? null,
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    resourceId: string,
    action: string,
    metadata: Record<string, unknown>,
    resource = "DoctorStatement",
  ) {
    return tx.auditLog.create({
      data: { tenantId, actorId, action, resource, resourceId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
