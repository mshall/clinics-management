import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { StatementExportKind } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import { buildBilingualPdf } from "../../billing-platform/bilingual-pdf";
import type { JwtUser } from "../../auth/jwt-user";
import { PrismaService } from "../../prisma/prisma.service";
import { canGrowth } from "../provider-links/growth-access";
import { localDay, monthRange, statementCsv, statementPdfSections, toMinor, totalsOf, fromMinor, type ChargeStatus, type DecisionKind, type StatementLine } from "./statements.logic";

/**
 * GRW-P2-C commission statements v2 (admin only: a doctor or receptionist never sees fees). The lines come from the append-only decision log and the charge
 * ledger, so the totals equal `KiorexCommissionDecision` and `KiorexCommissionCharge` by construction. Month boundaries are the market's local calendar.
 */
@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private tenant(user: JwtUser): string {
    if (!user.tenantId || !canGrowth(user, "revoke")) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Only an organisation admin can see Kiorex fee statements" });
    return user.tenantId;
  }

  private async zone(tenantId: string): Promise<string> {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { defaultTimezone: true } } } });
    return t?.market?.defaultTimezone || "Africa/Cairo";
  }

  async months(user: JwtUser): Promise<{ items: { month: string; charges: number }[] }> {
    const tenantId = this.tenant(user);
    const rows = await this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId }, select: { attendedAt: true }, orderBy: { attendedAt: "desc" }, take: 2000 });
    const zone = await this.zone(tenantId);
    const by = new Map<string, number>();
    for (const r of rows) by.set(localDay(r.attendedAt, zone).slice(0, 7), (by.get(localDay(r.attendedAt, zone).slice(0, 7)) ?? 0) + 1);
    return { items: [...by.entries()].map(([month, charges]) => ({ month, charges })).slice(0, 24) };
  }

  async statement(user: JwtUser, monthRaw: string | undefined, clinicId?: string) {
    const tenantId = this.tenant(user);
    const month = monthRaw ?? new Date().toISOString().slice(0, 7);
    const zone = await this.zone(tenantId);
    const range = monthRange(month, zone);
    if (!range) throw new BadRequestException({ code: "STATEMENT_MONTH_INVALID", message: "month must be YYYY-MM" });
    const clinicWhere = clinicId ? { clinicId } : {};
    const [decisionIn, chargeIn] = await Promise.all([
      this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, ...clinicWhere, createdAt: { gte: range.start, lt: range.end } }, select: { appointmentId: true } }),
      this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, ...clinicWhere, attendedAt: { gte: range.start, lt: range.end } }, select: { appointmentId: true } }),
    ]);
    const ids = [...new Set([...decisionIn, ...chargeIn].map((r) => r.appointmentId))];
    const [decisions, charges, appts] = ids.length
      ? await Promise.all([
          this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, appointmentId: { in: ids } }, orderBy: { createdAt: "desc" } }),
          this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, appointmentId: { in: ids } }, select: { appointmentId: true, amount: true, currency: true, status: true, commissionDispute: { select: { status: true } } } }),
          this.prisma.appointment.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, startsAt: true } }),
        ])
      : [[], [], []];
    const latest = new Map<string, (typeof decisions)[number]>();
    for (const d of decisions) if (!latest.has(d.appointmentId)) latest.set(d.appointmentId, d);
    const chargeBy = new Map(charges.map((c) => [c.appointmentId, c]));
    const startBy = new Map(appts.map((a) => [a.id, a.startsAt]));
    const lines: StatementLine[] = [...latest.values()]
      .map((d) => {
        const c = chargeBy.get(d.appointmentId);
        return {
          appointmentId: d.appointmentId,
          date: localDay(startBy.get(d.appointmentId) ?? d.createdAt, zone),
          isNewPatient: d.isNewPatient,
          origin: d.origin,
          bookingSource: d.bookingSource,
          decision: d.decision as DecisionKind,
          reasonCodes: d.reasonCodes,
          rateMinor: toMinor(d.amount),
          amountMinor: c ? toMinor(c.amount) : null,
          chargeStatus: (c?.status ?? null) as ChargeStatus | null,
          dispute: c?.commissionDispute?.status ?? null,
        };
      })
      .sort((a, b) => (a.date === b.date ? (a.appointmentId < b.appointmentId ? -1 : 1) : a.date < b.date ? -1 : 1));
    const totals = totalsOf(lines);
    const currency = charges[0]?.currency ?? "EGP";
    return {
      month,
      zone,
      currency,
      lines: lines.map((l) => ({ ...l, rate: l.rateMinor == null ? null : fromMinor(l.rateMinor), amount: l.amountMinor == null ? null : fromMinor(l.amountMinor) })),
      totals: { ...totals, active: fromMinor(totals.activeMinor), reversed: fromMinor(totals.reversedMinor), waived: fromMinor(totals.waivedMinor) },
      statement: "Charges for new patients who found you on Kiorex. Bookings through your own links never carry a Kiorex fee.",
    };
  }

  private async record(tenantId: string, userId: string, month: string, kind: StatementExportKind, bytes: Buffer | string) {
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const row = await this.prisma.commissionStatementExport.create({ data: { tenantId, month, kind, checksum, generatedBy: userId } });
    await this.audit.recordEvent({ tenantId, actorId: userId, clinicId: null, action: "growth.statement.exported", resource: "CommissionStatementExport", resourceId: row.id, metadata: { month, kind, checksum } });
    return { id: row.id, checksum };
  }

  async csv(user: JwtUser, month: string | undefined, clinicId?: string) {
    const s = await this.statement(user, month, clinicId);
    const body = statementCsv(s.month, s.currency, s.lines, s.totals);
    const rec = await this.record(user.tenantId!, user.userId, s.month, StatementExportKind.CSV, body);
    return { body, filename: `kiorex-statement-${s.month}.csv`, ...rec };
  }

  async pdf(user: JwtUser, month: string | undefined, clinicId?: string) {
    const s = await this.statement(user, month, clinicId);
    const bytes = buildBilingualPdf(statementPdfSections(s.month, s.currency, s.lines, s.totals));
    const rec = await this.record(user.tenantId!, user.userId, s.month, StatementExportKind.PDF, bytes);
    return { body: bytes, filename: `kiorex-statement-${s.month}.pdf`, ...rec };
  }

  async exports(user: JwtUser, month?: string) {
    const tenantId = this.tenant(user);
    const rows = await this.prisma.commissionStatementExport.findMany({ where: { tenantId, ...(month ? { month } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    return { items: rows.map((r) => ({ id: r.id, month: r.month, kind: r.kind, checksum: r.checksum, createdAt: r.createdAt.toISOString() })) };
  }
}
