import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { buildBilingualPdf, type PdfPageFormat, type PdfRow } from "../billing-platform/bilingual-pdf";
import { isTenantOwnerPrincipal } from "../common/effective-roles";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import {
  type DrawerTotals,
  SHIFT_CLOSED_TOPIC,
  SHIFT_STATUS,
  shiftCloseOutcome,
  shiftSummaryJson,
  shiftVarianceReviewThreshold,
  summarizeDrawer,
} from "./cashier-shift";
import { canApproveRefunds, canHandlePatientMoney, lockKey, roundMoney } from "./patient-money";

type Tx = Prisma.TransactionClient;
type ShiftRow = Prisma.CashierShiftGetPayload<object>;

function amount(n: unknown, field: string): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) throw new BadRequestException({ message: `${field} must be zero or more`, code: "AMOUNT_INVALID" });
  return roundMoney(v);
}

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

/** MN-03 — cash drawer shifts: open with a float, blind count at close, variance review, Z-report. */
@Injectable()
export class CashierShiftService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDesk(user: JwtUser) {
    if (!canHandlePatientMoney(user)) throw new ForbiddenException("Your role cannot handle the cash drawer");
  }

  private async clinic(tenantId: string, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true, nameEn: true, nameAr: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    return clinic;
  }

  /** Drawer activity at a clinic in [from, to). Shared with the legacy day cash-close. */
  async drawerTotals(db: Tx | PrismaService, tenantId: string, clinicId: string, from: Date, to: Date): Promise<DrawerTotals> {
    const payments = await db.billingPayment.findMany({
      where: { tenantId, clinicId, createdAt: { gte: from, lt: to } },
      select: { id: true, allocations: { select: { method: true, amount: true } } },
    });
    const fromDeposits = new Set(
      (
        await db.patientDeposit.findMany({
          where: { tenantId, paymentId: { in: payments.map((p) => p.id) } },
          select: { paymentId: true },
        })
      ).map((d) => d.paymentId),
    );
    const counted = payments.filter((p) => !fromDeposits.has(p.id));
    const movements = await db.cashMovement.findMany({
      where: { tenantId, clinicId, createdAt: { gte: from, lt: to }, sourceType: { not: "PAYMENT" } },
      select: { direction: true, method: true, amount: true, sourceType: true },
    });
    return summarizeDrawer(
      counted.flatMap((p) => p.allocations.map((a) => ({ method: a.method, amount: Number(a.amount) }))),
      movements.map((m) => ({ ...m, amount: Number(m.amount) })),
      counted.length,
    );
  }

  /** The open shift for a clinic — blind: expected amounts are never returned before close. */
  async current(tenantId: string, user: JwtUser, clinicId: string) {
    this.assertDesk(user);
    await this.clinic(tenantId, clinicId);
    const [open, last] = await Promise.all([
      this.prisma.cashierShift.findFirst({ where: { tenantId, clinicId, status: SHIFT_STATUS.OPEN } }),
      this.prisma.cashierShift.findFirst({ where: { tenantId, clinicId, status: SHIFT_STATUS.CLOSED }, orderBy: { closedAt: "desc" } }),
    ]);
    return { open: open ? this.serializeOpen(open) : null, lastClosed: last ? this.serializeClosed(last) : null };
  }

  async open(tenantId: string, user: JwtUser, body: { clinicId: string; openingFloat: number }) {
    this.assertDesk(user);
    await this.clinic(tenantId, body.clinicId);
    const openingFloat = amount(body.openingFloat, "openingFloat");
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const shift = await this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `cashier-shift:${body.clinicId}`);
      const existing = await tx.cashierShift.findFirst({ where: { tenantId, clinicId: body.clinicId, status: SHIFT_STATUS.OPEN }, select: { id: true } });
      if (existing) throw new ConflictException({ message: "A shift is already open for this clinic", code: "SHIFT_ALREADY_OPEN", shiftId: existing.id });
      const last = await tx.cashierShift.aggregate({ where: { clinicId: body.clinicId }, _max: { zNumber: true } });
      const row = await tx.cashierShift.create({
        data: {
          tenantId,
          clinicId: body.clinicId,
          zNumber: (last._max.zNumber ?? 0) + 1,
          currency: market.currency,
          openingFloat: new Prisma.Decimal(String(openingFloat)),
          openedBy: user.userId,
        },
      });
      await this.audit(tx, tenantId, user.userId, row.id, "CASHIER_SHIFT_OPENED", { clinicId: body.clinicId, zNumber: row.zNumber, openingFloat });
      return row;
    });
    return this.serializeOpen(shift);
  }

  async close(tenantId: string, user: JwtUser, shiftId: string, body: { countedCash: number; countedCard?: number; note?: string }) {
    this.assertDesk(user);
    const countedCash = amount(body.countedCash, "countedCash");
    const countedCard = amount(body.countedCard ?? 0, "countedCard");
    const note = body.note?.trim() || null;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const threshold = shiftVarianceReviewThreshold(market.providerConfig);
    const closed = await this.prisma.$transaction(async (tx) => {
      const head = await tx.cashierShift.findFirst({ where: { id: shiftId, tenantId }, select: { clinicId: true } });
      if (!head) throw new NotFoundException("Shift not found");
      await lockKey(tx, `cashier-shift:${head.clinicId}`);
      const shift = await tx.cashierShift.findUniqueOrThrow({ where: { id: shiftId } });
      if (shift.status !== SHIFT_STATUS.OPEN) throw new ConflictException({ message: "Shift is already closed", code: "SHIFT_NOT_OPEN" });
      const closedAt = new Date();
      const totals = await this.drawerTotals(tx, tenantId, shift.clinicId, shift.openedAt, closedAt);
      const outcome = shiftCloseOutcome({ openingFloat: Number(shift.openingFloat), totals, countedCash, countedCard, threshold });
      if (outcome.hasVariance && !note) {
        throw new BadRequestException({ message: "Counted amounts differ from the drawer — add a note", code: "VARIANCE_NOTE_REQUIRED" });
      }
      const dec = (n: number) => new Prisma.Decimal(String(n));
      const row = await tx.cashierShift.update({
        where: { id: shiftId },
        data: {
          status: SHIFT_STATUS.CLOSED,
          closedBy: user.userId,
          closedAt,
          expectedCash: dec(outcome.expectedCash),
          expectedCard: dec(outcome.expectedCard),
          countedCash: dec(countedCash),
          countedCard: dec(countedCard),
          cashVariance: dec(outcome.cashVariance),
          cardVariance: dec(outcome.cardVariance),
          varianceNote: note,
          reviewThreshold: dec(threshold),
          needsReview: outcome.needsReview,
          summaryJson: shiftSummaryJson(totals),
        },
      });
      await this.audit(tx, tenantId, user.userId, row.id, "CASHIER_SHIFT_CLOSED", {
        clinicId: row.clinicId,
        zNumber: row.zNumber,
        expectedCash: outcome.expectedCash,
        countedCash,
        cashVariance: outcome.cashVariance,
        cardVariance: outcome.cardVariance,
        needsReview: outcome.needsReview,
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: SHIFT_CLOSED_TOPIC,
          aggregateType: "CashierShift",
          aggregateId: row.id,
          target: "INTERNAL",
          status: "PENDING",
          payload: {
            shiftId: row.id,
            clinicId: row.clinicId,
            zNumber: row.zNumber,
            currency: row.currency,
            openingFloat: Number(row.openingFloat),
            expectedCash: outcome.expectedCash,
            countedCash,
            cashVariance: outcome.cashVariance,
            cardVariance: outcome.cardVariance,
            netCard: totals.netCard,
            paymentCount: totals.paymentCount,
            needsReview: outcome.needsReview,
            closedAt: closedAt.toISOString(),
          },
        },
      });
      return row;
    });
    return this.serializeClosed(closed);
  }

  async list(tenantId: string, user: JwtUser, filter: { clinicId?: string; needsReview?: boolean; limit?: number }) {
    this.assertDesk(user);
    const rows = await this.prisma.cashierShift.findMany({
      where: {
        tenantId,
        status: SHIFT_STATUS.CLOSED,
        ...(filter.clinicId ? { clinicId: filter.clinicId } : {}),
        ...(filter.needsReview ? { needsReview: true, reviewedAt: null } : {}),
      },
      orderBy: { closedAt: "desc" },
      take: Math.min(100, filter.limit ?? 30),
    });
    return rows.map((r) => this.serializeClosed(r));
  }

  async review(tenantId: string, user: JwtUser, shiftId: string, body: { note?: string }) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners or finance can review a shift");
    const note = body.note?.trim();
    if (!note) throw new BadRequestException({ message: "A review note is required", code: "REVIEW_NOTE_REQUIRED" });
    const row = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashierShift.findFirst({ where: { id: shiftId, tenantId } });
      if (!shift) throw new NotFoundException("Shift not found");
      if (shift.status !== SHIFT_STATUS.CLOSED || !shift.needsReview) {
        throw new ConflictException({ message: "Shift is not waiting for review", code: "SHIFT_NOT_FLAGGED" });
      }
      if (shift.reviewedAt) throw new ConflictException({ message: "Shift already reviewed", code: "SHIFT_ALREADY_REVIEWED" });
      if (shift.closedBy === user.userId && !isTenantOwnerPrincipal(user)) {
        throw new ForbiddenException({ message: "Someone other than the cashier must review the variance", code: "SHIFT_REVIEW_SELF" });
      }
      const updated = await tx.cashierShift.update({
        where: { id: shiftId },
        data: { reviewedBy: user.userId, reviewedAt: new Date(), reviewNote: note },
      });
      await this.audit(tx, tenantId, user.userId, shiftId, "CASHIER_SHIFT_REVIEWED", { note, cashVariance: num(shift.cashVariance) });
      return updated;
    });
    return this.serializeClosed(row);
  }

  async zReport(tenantId: string, user: JwtUser, shiftId: string, format: string | undefined) {
    this.assertDesk(user);
    const shift = await this.prisma.cashierShift.findFirst({ where: { id: shiftId, tenantId } });
    if (!shift) throw new NotFoundException("Shift not found");
    if (shift.status !== SHIFT_STATUS.CLOSED) throw new ConflictException({ message: "Close the shift before printing the Z-report", code: "SHIFT_NOT_CLOSED" });
    const pdfFormat: PdfPageFormat = format?.toLowerCase() === "thermal" ? "THERMAL_80" : "A4";
    const [clinic, market, people] = await Promise.all([
      this.clinic(tenantId, shift.clinicId),
      resolveMarketForTenant(this.prisma, tenantId),
      this.prisma.user.findMany({
        where: { id: { in: [shift.openedBy, shift.closedBy, shift.reviewedBy].filter((x): x is string => Boolean(x)) } },
        select: { id: true, displayName: true },
      }),
    ]);
    const nameOf = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? "—";
    const totals = (shift.summaryJson ?? {}) as unknown as DrawerTotals;
    const money = (n: number | null) => `${(n ?? 0).toFixed(2)} ${shift.currency}`;
    const when = (d: Date | null) =>
      d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: market.timezone }).format(d) : "—";
    const small = pdfFormat === "THERMAL_80";
    const size = small ? 8 : 10;
    const L = {
      en: {
        title: "Z-report",
        opened: "Opened",
        closed: "Closed",
        by: "by",
        float: "Opening float",
        payments: "Payments",
        movements: "Other drawer movements",
        cashIn: "Cash in",
        cashOut: "Cash out",
        expectedCash: "Expected cash",
        countedCash: "Counted cash",
        cashVariance: "Cash variance",
        expectedCard: "Expected card",
        countedCard: "Counted card",
        cardVariance: "Card variance",
        note: "Note",
        review: "Flagged for review",
        reviewed: "Reviewed",
      },
      ar: {
        title: "تقرير Z",
        opened: "الفتح",
        closed: "الإغلاق",
        by: "بواسطة",
        float: "رصيد الافتتاح",
        payments: "المدفوعات",
        movements: "حركات الدرج الأخرى",
        cashIn: "نقدية داخلة",
        cashOut: "نقدية خارجة",
        expectedCash: "النقدية المتوقعة",
        countedCash: "النقدية المعدودة",
        cashVariance: "فرق النقدية",
        expectedCard: "البطاقات المتوقعة",
        countedCard: "البطاقات المعدودة",
        cardVariance: "فرق البطاقات",
        note: "ملاحظة",
        review: "يحتاج مراجعة",
        reviewed: "تمت المراجعة",
      },
    };
    const rows = (lang: "en" | "ar"): PdfRow[] => {
      const t = L[lang];
      const out: PdfRow[] = [
        { kind: "text", text: lang === "en" ? clinic.nameEn : clinic.nameAr || clinic.nameEn, size: size + 3, bold: true },
        { kind: "text", text: `${t.title} #${shift.zNumber}`, size: size + 2, bold: true },
        { kind: "pair", label: t.opened, value: `${when(shift.openedAt)} · ${nameOf(shift.openedBy)}`, size },
        { kind: "pair", label: t.closed, value: `${when(shift.closedAt)} · ${nameOf(shift.closedBy)}`, size },
        { kind: "rule" },
        { kind: "pair", label: t.float, value: money(num(shift.openingFloat)), size },
        { kind: "text", text: t.payments, size, bold: true },
        ...Object.entries(totals.paymentsByMethod ?? {}).map(([m, v]): PdfRow => ({ kind: "pair", label: m, value: money(v ?? 0), size })),
      ];
      const moves = Object.entries(totals.movementsBySource ?? {});
      if (moves.length) {
        out.push({ kind: "text", text: t.movements, size, bold: true });
        for (const [k, v] of moves) out.push({ kind: "pair", label: k, value: money(v), size });
      }
      out.push(
        { kind: "rule" },
        { kind: "pair", label: t.cashIn, value: money(totals.cashIn ?? 0), size },
        { kind: "pair", label: t.cashOut, value: money(totals.cashOut ?? 0), size },
        { kind: "pair", label: t.expectedCash, value: money(num(shift.expectedCash)), size, bold: true },
        { kind: "pair", label: t.countedCash, value: money(num(shift.countedCash)), size, bold: true },
        { kind: "pair", label: t.cashVariance, value: money(num(shift.cashVariance)), size, bold: true },
        { kind: "pair", label: t.expectedCard, value: money(num(shift.expectedCard)), size },
        { kind: "pair", label: t.countedCard, value: money(num(shift.countedCard)), size },
        { kind: "pair", label: t.cardVariance, value: money(num(shift.cardVariance)), size },
      );
      if (shift.varianceNote) out.push({ kind: "text", text: `${t.note}: ${shift.varianceNote}`, size });
      if (shift.needsReview) {
        out.push({
          kind: "text",
          text: shift.reviewedAt ? `${t.reviewed} · ${nameOf(shift.reviewedBy)} · ${shift.reviewNote ?? ""}` : t.review,
          size,
          bold: true,
        });
      }
      return out;
    };
    return {
      pdf: buildBilingualPdf(
        [
          { direction: "ltr", rows: rows("en") },
          { direction: "rtl", rows: rows("ar") },
        ],
        { format: pdfFormat },
      ),
      filename: `z-report-${shift.zNumber}-${small ? "thermal" : "a4"}.pdf`,
    };
  }

  private serializeOpen(s: ShiftRow) {
    return {
      id: s.id,
      clinicId: s.clinicId,
      zNumber: s.zNumber,
      status: s.status,
      currency: s.currency,
      openingFloat: Number(s.openingFloat),
      openedBy: s.openedBy,
      openedAt: s.openedAt.toISOString(),
    };
  }

  private serializeClosed(s: ShiftRow) {
    return {
      ...this.serializeOpen(s),
      closedBy: s.closedBy,
      closedAt: s.closedAt?.toISOString() ?? null,
      expectedCash: num(s.expectedCash),
      expectedCard: num(s.expectedCard),
      countedCash: num(s.countedCash),
      countedCard: num(s.countedCard),
      cashVariance: num(s.cashVariance),
      cardVariance: num(s.cardVariance),
      varianceNote: s.varianceNote,
      reviewThreshold: num(s.reviewThreshold),
      needsReview: s.needsReview,
      reviewedBy: s.reviewedBy,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      reviewNote: s.reviewNote,
      summary: (s.summaryJson ?? null) as DrawerTotals | null,
    };
  }

  private audit(tx: Tx, tenantId: string, actorId: string, resourceId: string, action: string, metadata: Record<string, unknown>) {
    return tx.auditLog.create({
      data: { tenantId, actorId, action, resource: "CashierShift", resourceId, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
