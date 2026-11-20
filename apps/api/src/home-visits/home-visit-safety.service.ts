import { Injectable, Inject, Logger } from "@nestjs/common";
import { HomeSafetyAlertKind, HomeVisitState, Prisma, type HomeVisit } from "@prisma/client";
import { answerSafetyPrompt, buildSafetyAlert, buildSos, SAFETY_ALERT_SLA_SECONDS, SAFETY_ANSWER_WINDOW_MIN, type FieldVisit, type SafetyAlert, type SafetyState } from "@kiorly/field-visit";
import { FIELD_VISIT_PORT, type FieldVisitPort } from "../field-visit/field-visit.port";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_EVENT_V23 } from "../messaging/outbox-event-types";
import { notifyOnCall } from "../observability/notify-on-call";
import { PrismaService } from "../prisma/prisma.service";
import { safetyAlertRaisedData, type SafetyAlertEventKind } from "./home-visit-events";
import { emitSafetyLog } from "./safety-log";

type VisitWithAppt = HomeVisit & { appointment: { clinicId: string; externalReference: string | null; platformIntegrationClientId: string | null } };

const EVENT_KIND: Record<HomeSafetyAlertKind, SafetyAlertEventKind> = {
  NO_ANSWER: "TIMER_EXPIRED",
  SOS: "SOS",
  UNSAFE_ABORT: "UNSAFE_ABORT",
};

/**
 * HVSAF01/02/04 — raise, deliver and track safety alerts. ADR-025: a safety control, never a feature flag (no flag
 * reads anywhere in this file; `ff-safety-never-flags.node.test.ts` enforces it).
 */
@Injectable()
export class HomeVisitSafetyService {
  private readonly log = new Logger(HomeVisitSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIELD_VISIT_PORT) private readonly port: FieldVisitPort,
    private readonly outbox: OutboxEventService,
  ) {}

  /** Package view of a persisted visit (history reduced to the stamps the alert needs). */
  toFieldVisit(v: HomeVisit, stamps: { kind: string; lat: number | null; lng: number | null; districtId: string | null; recordedAt: Date }[]): FieldVisit {
    return {
      id: v.id,
      state: v.state as FieldVisit["state"],
      plannedStartMs: v.plannedStartsAt.getTime(),
      plannedEndMs: v.plannedEndsAt.getTime(),
      assignedClinicianId: v.clinicianId ?? undefined,
      endedAtMs: v.endedAt?.getTime(),
      abortReason: v.abortReason ?? undefined,
      history: stamps.map((s) => ({
        state: s.kind as FieldVisit["state"],
        atMs: s.recordedAt.getTime(),
        ...(s.lat != null && s.lng != null ? { geostamp: { lat: s.lat, lng: s.lng, ...(s.districtId ? { districtId: s.districtId } : {}) } } : {}),
      })),
    };
  }

  private async load(tenantId: string, visitId: string): Promise<{ v: VisitWithAppt; fv: FieldVisit } | null> {
    const v = await this.prisma.homeVisit.findFirst({
      where: { id: visitId, tenantId },
      include: {
        appointment: { select: { clinicId: true, externalReference: true, platformIntegrationClientId: true } },
        geostamps: { orderBy: { recordedAt: "asc" } },
      },
    });
    if (!v) return null;
    const { geostamps, ...rest } = v;
    return { v: rest as VisitWithAppt, fv: this.toFieldVisit(rest, geostamps) };
  }

  /** Persists the alert row, logs `safety_alert.raised`, delivers it to the organisation safety contact and (Kiorex bookings) queues SAFETY_ALERT_RAISED. */
  async raise(
    tenantId: string,
    visitId: string,
    kind: HomeSafetyAlertKind,
    opts: { dueAt?: Date; liveLocation?: { lat: number; lng: number }; now?: Date } = {},
  ) {
    const loaded = await this.load(tenantId, visitId);
    if (!loaded) throw new Error("Home visit not found");
    const now = opts.now ?? new Date();
    const dueAt = opts.dueAt ?? now;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { safetyContactPhone: true } });
    const contact = tenant?.safetyContactPhone?.trim() ?? "";

    const row = await this.prisma.homeSafetyAlert.create({
      data: { tenantId, visitId, kind, raisedAt: now, dueAt, status: "PENDING" },
    });
    emitSafetyLog({ event: "safety_alert.raised", alertId: row.id, kind });

    const kiorexBooking = loaded.v.appointment.platformIntegrationClientId != null;
    // Kiorex ops is told through the outbox (5 s dispatch loop) for Kiorex bookings only: non-Kiorex visits have no Kiorex-side consumer.
    if (kiorexBooking) {
      await this.outbox.enqueueEvent({
        tenantId,
        type: OUTBOX_EVENT_V23.SAFETY_ALERT_RAISED,
        aggregateType: "SafetyAlert",
        aggregateId: row.id,
        payload: safetyAlertRaisedData({
          alertId: row.id,
          clinicId: loaded.v.appointment.clinicId,
          appointmentId: loaded.v.appointmentId,
          externalReference: loaded.v.appointment.externalReference,
          kind: EVENT_KIND[kind],
          raisedAt: now,
          district: loaded.v.districtId,
          kiorexBooking,
        }),
      });
    }

    let alert: SafetyAlert;
    if (!contact) {
      // No safety contact configured: cannot deliver. Fail loudly and page on-call (never silent).
      return this.markFailed(row.id, tenantId, "NO_CONTACT", now);
    }
    if (kind === "SOS" && opts.liveLocation) {
      alert = buildSos({ visit: loaded.fv, contactId: contact, nowMs: now.getTime(), liveLocation: opts.liveLocation }).alert;
    } else {
      alert = buildSafetyAlert({ kind: kind === "SOS" ? "SOS" : kind === "UNSAFE_ABORT" ? "UNSAFE_ABORT" : "NO_ANSWER", visit: loaded.fv, contactId: contact, nowMs: now.getTime() });
    }
    const res = await this.port.deliverSafetyAlert(alert, dueAt.getTime(), { tenantId, contactAddress: contact });
    if (!res.delivered) return this.markFailed(row.id, tenantId, res.attempts.at(-1)?.channel ?? "UNKNOWN", now);
    const channel = String(res.receipt?.channel ?? "SMS");
    emitSafetyLog({ event: "safety_alert.delivered", alertId: row.id, channel, deliveryLatencyMs: res.latencyMs });
    const updated = await this.prisma.homeSafetyAlert.update({
      where: { id: row.id },
      data: { status: "DELIVERED", deliveredAt: new Date(res.receipt?.deliveredAtMs ?? Date.now()), deliveryChannel: channel, latencyMs: res.latencyMs, withinSla: res.withinSla },
    });
    if (!res.withinSla) notifyOnCall("SAFETY_ALERT_UNDELIVERED", { alertId: row.id, reason: "LATE", latencyMs: res.latencyMs, slaSeconds: SAFETY_ALERT_SLA_SECONDS });
    return { alert: updated, delivered: true, withinSla: res.withinSla, latencyMs: res.latencyMs };
  }

  private async markFailed(alertId: string, tenantId: string, channel: string, _now: Date) {
    emitSafetyLog({ event: "safety_alert.delivery_failed", alertId, channel });
    notifyOnCall("SAFETY_ALERT_UNDELIVERED", { alertId, tenantId, reason: "DELIVERY_FAILED" });
    const updated = await this.prisma.homeSafetyAlert.update({ where: { id: alertId }, data: { status: "FAILED", deliveryChannel: channel.slice(0, 24) } });
    return { alert: updated, delivered: false, withinSla: false, latencyMs: null as number | null };
  }

  /** HVSAF02 — one-tap SOS. Always allowed for the assigned clinician in ON_MY_WAY/ARRIVED; returns 123 / 122 to show. */
  async sos(tenantId: string, visitId: string, liveLocation: { lat: number; lng: number }, now = new Date()) {
    const loaded = await this.load(tenantId, visitId);
    if (!loaded) throw new Error("Home visit not found");
    const out = await this.raise(tenantId, visitId, HomeSafetyAlertKind.SOS, { liveLocation, now });
    return { ...out, show: { ambulance: "123", police: "122" } };
  }

  /** HVSAF01 — clinician answers the "are you OK?" prompt; the alert timer restarts from the answer. */
  async answerPrompt(tenantId: string, visitId: string, now = new Date()): Promise<void> {
    const v = await this.prisma.homeVisit.findFirst({ where: { id: visitId, tenantId } });
    if (!v) return;
    const next = answerSafetyPrompt(this.stateOf(v), now.getTime());
    await this.prisma.homeVisit.update({
      where: { id: v.id },
      data: { safetyAnsweredAt: new Date(next.answeredAtMs!), safetyPromptSentAt: null, safetyAlertSentAt: null },
    });
  }

  stateOf(v: Pick<HomeVisit, "safetyPromptSentAt" | "safetyAnsweredAt" | "safetyAlertSentAt">): SafetyState {
    return {
      ...(v.safetyPromptSentAt ? { promptSentAtMs: v.safetyPromptSentAt.getTime() } : {}),
      ...(v.safetyAnsweredAt ? { answeredAtMs: v.safetyAnsweredAt.getTime() } : {}),
      ...(v.safetyAlertSentAt ? { alertSentAtMs: v.safetyAlertSentAt.getTime() } : {}),
    };
  }

  /**
   * HVSAF01 tick — evaluate every active visit whose planned end + 30 min has passed (and those mid-prompt). Called every <= 15 s
   * (SLA budget in the safety drill). Idempotent: prompts/alerts are claimed with a conditional update so concurrent
   * instances cannot double-send.
   */
  async tick(now = new Date()): Promise<{ prompts: number; alerts: number }> {
    const cutoff = new Date(now.getTime() - 30 * 60_000);
    const visits = await this.prisma.homeVisit.findMany({
      where: {
        state: { in: [HomeVisitState.ON_MY_WAY, HomeVisitState.ARRIVED] },
        OR: [{ plannedEndsAt: { lte: cutoff } }, { safetyAnsweredAt: { not: null } }, { safetyPromptSentAt: { not: null } }],
        safetyAlertSentAt: null,
      },
      include: { geostamps: { orderBy: { recordedAt: "asc" } } },
      take: 200,
    });
    let prompts = 0;
    let alerts = 0;
    for (const v of visits) {
      const { geostamps, ...rest } = v;
      const fv = this.toFieldVisit(rest, geostamps);
      const evaluation = this.port.evaluateSafetyTimer(fv, this.stateOf(v), now.getTime());
      for (const action of evaluation.actions) {
        if (action.type === "PROMPT_CLINICIAN") {
          const claimed = await this.prisma.homeVisit.updateMany({ where: { id: v.id, safetyPromptSentAt: null }, data: { safetyPromptSentAt: now } });
          if (claimed.count === 1) {
            prompts++;
            await this.notifyClinician(v);
          }
        } else if (action.type === "ALERT_SAFETY_CONTACT") {
          const claimed = await this.prisma.homeVisit.updateMany({ where: { id: v.id, safetyAlertSentAt: null }, data: { safetyAlertSentAt: now } });
          if (claimed.count === 1) {
            alerts++;
            await this.raise(v.tenantId, v.id, HomeSafetyAlertKind.NO_ANSWER, { dueAt: new Date(action.dueAtMs), now });
          }
        }
      }
    }
    await this.escalateUnacknowledged(now);
    return { prompts, alerts };
  }

  /** KX-09 failure table: no ack from the safety contact in 10 min -> Kiorex ops on-call (Kiorex bookings) and the org owner. */
  async escalateUnacknowledged(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SAFETY_ANSWER_WINDOW_MIN * 60_000);
    const stale = await this.prisma.homeSafetyAlert.findMany({
      where: { status: "DELIVERED", acknowledgedAt: null, escalatedAt: null, raisedAt: { lte: cutoff } },
      take: 100,
    });
    for (const a of stale) {
      const claimed = await this.prisma.homeSafetyAlert.updateMany({ where: { id: a.id, escalatedAt: null }, data: { status: "ESCALATED", escalatedAt: now } });
      if (claimed.count !== 1) continue;
      emitSafetyLog({ event: "safety_alert.escalated", alertId: a.id });
      notifyOnCall("SAFETY_ALERT_UNDELIVERED", { alertId: a.id, tenantId: a.tenantId, reason: "NOT_ACKNOWLEDGED" });
      const owners = await this.prisma.user.findMany({ where: { tenantId: a.tenantId, isTenantOwner: true }, select: { id: true } });
      for (const o of owners) {
        await this.prisma.staffInAppNotice.create({
          data: {
            tenantId: a.tenantId,
            userId: o.id,
            kind: "HOME_SAFETY_ESCALATION",
            titleEn: "Safety alert not acknowledged",
            titleAr: "تنبيه سلامة لم يتم تأكيده",
            bodyEn: "A home-visit safety alert was not acknowledged within 10 minutes. Please contact the clinician now.",
            bodyAr: "لم يتم تأكيد تنبيه سلامة لزيارة منزلية خلال 10 دقائق. يرجى الاتصال بالممارس الآن.",
            metadata: { alertId: a.id, visitId: a.visitId } as Prisma.InputJsonValue,
          },
        });
      }
    }
    return stale.length;
  }

  private async notifyClinician(v: HomeVisit): Promise<void> {
    if (!v.clinicianId) return;
    try {
      await this.prisma.staffInAppNotice.create({
        data: {
          tenantId: v.tenantId,
          userId: v.clinicianId,
          kind: "HOME_SAFETY_PROMPT",
          titleEn: "Are you OK?",
          titleAr: "هل أنت بخير؟",
          bodyEn: "Your home visit is overdue. Tap Finished or answer \"I'm OK\" within 10 minutes, or your safety contact is alerted.",
          bodyAr: "زيارتك المنزلية تأخرت. اضغط \"انتهيت\" أو أجب \"أنا بخير\" خلال 10 دقائق وإلا سيتم تنبيه جهة الاتصال للسلامة.",
          metadata: { visitId: v.id } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }

  async acknowledge(tenantId: string, alertId: string, byUserId: string) {
    const a = await this.prisma.homeSafetyAlert.findFirst({ where: { id: alertId, tenantId } });
    if (!a) return null;
    return this.prisma.homeSafetyAlert.update({ where: { id: a.id }, data: { acknowledgedAt: a.acknowledgedAt ?? new Date(), status: a.status === "ESCALATED" || a.status === "RESOLVED" ? a.status : "ACKNOWLEDGED" } }).then((r) => ({ ...r, ackBy: byUserId }));
  }

  async resolve(tenantId: string, alertId: string) {
    const a = await this.prisma.homeSafetyAlert.findFirst({ where: { id: alertId, tenantId } });
    if (!a) return null;
    return this.prisma.homeSafetyAlert.update({ where: { id: a.id }, data: { status: "RESOLVED", resolvedAt: new Date(), acknowledgedAt: a.acknowledgedAt ?? new Date() } });
  }

  async listAlerts(tenantId: string, limit = 50) {
    return this.prisma.homeSafetyAlert.findMany({ where: { tenantId }, orderBy: { raisedAt: "desc" }, take: limit });
  }
}
