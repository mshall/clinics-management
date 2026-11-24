import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommissionChargeStatus, type Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { canGrowth } from "../growth/provider-links/growth-access";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionChargeService, type BilledReversalCreditIntent } from "./commission-charge.service";
import { reconcileStatement } from "./commission-reconciliation";

export const OVERRIDE_REASONS = ["GOODWILL_WAIVER", "POLICY_CORRECTION"] as const;

/** Read side of the commission decision log (founder-readable explanation, provider statement) and the audited override. */
@Injectable()
export class CommissionDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: CommissionChargeService,
  ) {}

  private tenantOf(user: JwtUser): string {
    if (!user.tenantId || !canGrowth(user, "view")) throw new ForbiddenException({ code: "GROWTH_FORBIDDEN", message: "Your role cannot read commission decisions" });
    return user.tenantId;
  }

  /** Why a fee was or was not applied, newest first. Facts only: no patient identifiers. */
  async explain(user: JwtUser, appointmentId: string) {
    const tenantId = this.tenantOf(user);
    if (!appointmentId) throw new BadRequestException("appointmentId is required");
    const rows = await this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, appointmentId }, orderBy: { createdAt: "desc" } });
    if (!rows.length) {
      const exists = await this.prisma.appointment.count({ where: { id: appointmentId, tenantId } });
      if (!exists) throw new NotFoundException("Appointment not found");
    }
    return {
      appointmentId,
      items: rows.map((r) => ({
        id: r.id,
        policyVersion: r.policyVersion,
        origin: r.origin,
        bookingSource: r.bookingSource,
        isNewPatient: r.isNewPatient,
        decision: r.decision,
        reasonCodes: r.reasonCodes,
        rateId: r.rateId,
        amount: r.amount?.toFixed(2) ?? null,
        currency: r.currency,
        inputsHash: r.inputsHash,
        createdAt: r.createdAt.toISOString(),
        explanation: explainDecision(r.decision, r.reasonCodes),
      })),
    };
  }

  /** Provider statement for a month (YYYY-MM): decisions vs charges, with an explicit reconciliation verdict. */
  async statement(user: JwtUser, q: { period?: string; clinicId?: string }) {
    const tenantId = this.tenantOf(user);
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(q.period ?? new Date().toISOString().slice(0, 7));
    if (!m) throw new BadRequestException("period must be YYYY-MM");
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
    const clinicWhere = q.clinicId ? { clinicId: q.clinicId } : {};
    // An appointment belongs to the period when it has a decision created or a charge attended in it; both sides of every such appointment are loaded
    // in full so a backdated check-in or a later adjustment can never make a pair look one-sided.
    const [decisionIn, chargeIn] = await Promise.all([
      this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, ...clinicWhere, createdAt: { gte: start, lt: end } }, select: { appointmentId: true } }),
      this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, ...clinicWhere, attendedAt: { gte: start, lt: end } }, select: { appointmentId: true } }),
    ]);
    const ids = [...new Set([...decisionIn, ...chargeIn].map((r) => r.appointmentId))];
    const [all, charges] = ids.length
      ? await Promise.all([
          this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId, appointmentId: { in: ids } } }),
          this.prisma.kiorexCommissionCharge.findMany({ where: { tenantId, appointmentId: { in: ids } }, select: { appointmentId: true, amount: true, status: true, reversalReason: true, currency: true } }),
        ])
      : [[], []];
    const rec = reconcileStatement(
      all.map((d) => ({ appointmentId: d.appointmentId, policyVersion: d.policyVersion, decision: d.decision, origin: d.origin, reasonCodes: d.reasonCodes, amount: d.amount?.toFixed(2) ?? null, createdAt: d.createdAt })),
      charges.map((c) => ({ appointmentId: c.appointmentId, amount: c.amount.toFixed(2), status: c.status, reversalReason: c.reversalReason })),
    );
    const byStatus: Record<string, { count: number; amount: string }> = {};
    for (const c of charges) {
      const s = (byStatus[c.status] ??= { count: 0, amount: "0.00" });
      s.count += 1;
      s.amount = (Math.round((Number(s.amount) + Number(c.amount)) * 100) / 100).toFixed(2);
    }
    return {
      period: `${m[1]}-${m[2]}`,
      currency: charges[0]?.currency ?? "EGP",
      chargesByStatus: byStatus,
      providerLedBookings: rec.byOrigin.PROVIDER_LED ?? 0,
      ...rec,
      statement: "Charges for new patients who found you on Kiorex. Bookings through your own links never carry a Kiorex fee.",
    };
  }

  /**
   * Platform-only override: waive an active charge (GOODWILL_WAIVER or POLICY_CORRECTION). Removal only: this endpoint can never create or raise a fee.
   * The reason is mandatory, the decision is appended (never edited), the change is audited and CommissionAdjusted goes to Kiorex.
   */
  async override(user: JwtUser, body: { appointmentId?: string; reason?: string; note?: string }) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin required");
    const reason = String(body.reason ?? "");
    if (!(OVERRIDE_REASONS as readonly string[]).includes(reason)) throw new BadRequestException(`reason must be one of ${OVERRIDE_REASONS.join(", ")}`);
    const note = body.note?.trim();
    if (!note || note.length < 5) throw new BadRequestException("A note of at least 5 characters is required");
    const apt = await this.prisma.appointment.findFirst({ where: { id: body.appointmentId ?? "" }, select: { id: true, tenantId: true } });
    if (!apt) throw new NotFoundException("Appointment not found");
    let intent: BilledReversalCreditIntent | null = null;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      intent = await this.charges.onOverrideWaive(tx, apt.tenantId, apt.id, reason, user.userId);
      await tx.auditLog.create({
        data: { tenantId: apt.tenantId, actorId: user.userId, action: "kiorex.commission_decision.override", resource: "Appointment", resourceId: apt.id, metadata: { reason, note } as Prisma.InputJsonValue },
      });
    });
    if (intent) await this.charges.grantLateReversalCredit(intent);
    return this.prisma.kiorexCommissionDecision.findMany({ where: { tenantId: apt.tenantId, appointmentId: apt.id }, orderBy: { createdAt: "desc" }, take: 1 }).then((r) => ({ ok: true, decisionId: r[0]?.id ?? null, status: CommissionChargeStatus.REVERSED }));
  }
}

const EXPLAIN_EN: Record<string, string> = {
  PROVIDER_LED: "The patient booked through your own link or widget, so no Kiorex fee applies.",
  CLINIC_LINK_CHANNEL: "The booking came from your clinic booking page, so no Kiorex fee applies.",
  FOLLOW_UP_VISIT: "A follow-up visit of a care plan is never charged.",
  RETURNING_PATIENT: "The patient had already visited you in the last 24 months.",
  SOURCE_NOT_COMMISSIONABLE: "The booking did not come through Kiorex.",
  NO_RATE_CONFIGURED: "No Kiorex fee rate was in force for this visit.",
  NO_MARKET: "The organisation has no market configured.",
  KIOREX_NEW_PATIENT: "A new patient who found you on Kiorex attended their first visit.",
  MARKETPLACE_ORIGIN: "Kiorex attributed the booking to the marketplace.",
  UNATTRIBUTED_TREATED_AS_MARKETPLACE: "A Kiorex booking without provider evidence is treated as found on Kiorex.",
  PROVIDER_LED_EVIDENCE: "Evidence showed the patient came through your own channel; the fee was removed.",
  GOODWILL_WAIVER: "Kiorex waived the fee as goodwill.",
  POLICY_CORRECTION: "Kiorex corrected the fee under policy.",
  MANUAL_OVERRIDE: "Applied manually by an authorised Kiorex administrator.",
};
export function explainDecision(decision: string, reasonCodes: string[]): string {
  const head = decision === "CHARGE" ? "Fee applied." : decision === "WAIVED" ? "Fee waived." : "No fee.";
  return [head, ...reasonCodes.map((c) => EXPLAIN_EN[c]).filter(Boolean)].join(" ");
}
