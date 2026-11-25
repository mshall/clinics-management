import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PromotionBudgetService } from "./promotion-budget.service";

const DAY_MS = 24 * 3_600_000;

/**
 * Attendance and cancel consumer (GRW-P2-S). It reads the appointment state of every sponsored booking and settles the promotion; it is a self-healing poller, not a hook inside the check-in,
 * completion or cancellation code, so a promotion problem can never fail a clinical or front-desk action. Idempotent: every step is keyed by the reservation.
 *  BOOKED  + appointment COMPLETED                                   -> DEBIT (RELEASE converted + DEBIT, wallet consumed once)
 *  BOOKED  + CHECKED_IN for 24 h (the commission rule: 24 h confirmed) -> DEBIT
 *  BOOKED  + CANCELLED or NO_SHOW                                    -> RELEASE (no discount was earned; wallet untouched)
 *  DEBITED + appointment back to CANCELLED, NO_SHOW or SCHEDULED/CONFIRMED (completion undone) -> REVERSE_DEBIT, credit back once
 * A debit without attendance evidence is refused by the budget service (PF_NO_ATTENDANCE), so a COMPLETED status alone, with no check-in time, never debits.
 */
@Injectable()
export class PromotionCompletionConsumer {
  private readonly log = new Logger(PromotionCompletionConsumer.name);
  constructor(private readonly prisma: PrismaService, private readonly budget: PromotionBudgetService) {}

  async runOnce(now = new Date(), limit = 300) {
    const out = { debited: 0, released: 0, reversed: 0, held: 0, errors: 0 };
    const rows = await this.prisma.promotionReservation.findMany({ where: { state: { in: ["BOOKED", "DEBITED"] }, appointmentId: { not: null } }, take: limit, orderBy: { createdAt: "asc" }, select: { tenantId: true, appointmentId: true, state: true } });
    if (!rows.length) return out;
    const apts = await this.prisma.appointment.findMany({ where: { id: { in: rows.map((r) => r.appointmentId!) } }, select: { id: true, status: true, checkedInAt: true } });
    const byId = new Map(apts.map((a) => [a.id, a]));
    for (const r of rows) {
      const a = byId.get(r.appointmentId!); if (!a) continue;
      try {
        if (r.state === "BOOKED") {
          if (a.status === "COMPLETED" || (a.status === "CHECKED_IN" && a.checkedInAt && now.getTime() - a.checkedInAt.getTime() >= DAY_MS)) {
            const res = await this.budget.debitForAppointment(r.tenantId, a.id, undefined, now);
            if (res.state === "DEBITED") out.debited++; else if (res.state === "HELD_NO_ATTENDANCE") out.held++;
          } else if (a.status === "CANCELLED" || a.status === "NO_SHOW") {
            await this.prisma.$transaction(async (tx) => { const x = await this.budget.releaseForAppointment(r.tenantId, a.id, a.status === "NO_SHOW" ? "NO_SHOW" : "CANCELLED_BEFORE_VISIT", tx); if (x.released) out.released++; });
          }
        } else if (a.status === "CANCELLED" || a.status === "NO_SHOW" || a.status === "SCHEDULED" || a.status === "CONFIRMED") {
          const x = await this.budget.reverseForAppointment(r.tenantId, a.id, a.status === "CANCELLED" || a.status === "NO_SHOW" ? "VISIT_CANCELLED_AFTER_DEBIT" : "COMPLETION_REVERTED");
          if (x.reversed) out.reversed++;
        }
      } catch (e) { out.errors++; this.log.warn(`promotion consumer ${a.id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    return out;
  }
}
