import type { DispatchReceipt, SafetyAlert, SafetyAlertDispatcher } from "@kiorly/field-visit";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";

/**
 * MODE=mock safety-alert channel (CLAUDE.md: provider integrations are mocked until the go-live pass). Writes the alert into
 * the dev inbox as an SMS to the organisation's safety contact — the same shape the real SMS/WhatsApp adapter will send.
 * The body carries NO patient data and NO address: only the visit id, coarse last position, and emergency numbers.
 */
export class MockSafetyAlertDispatcher implements SafetyAlertDispatcher {
  readonly channel = "SMS";

  constructor(
    private readonly tenantId: string | null,
    private readonly toAddress: string,
    private readonly nowMs: () => number = Date.now,
  ) {}

  async dispatch(alert: SafetyAlert): Promise<DispatchReceipt> {
    const where = alert.liveLocation
      ? `live ${alert.liveLocation.lat},${alert.liveLocation.lng}`
      : alert.lastGeostamp
        ? `last seen ~${alert.lastGeostamp.lat},${alert.lastGeostamp.lng}`
        : "location unknown";
    const body =
      alert.kind === "SOS"
        ? `Kiorly SOS from a home visit (${alert.visitId}). ${where}. Ambulance ${alert.emergencyNumbers.ambulance}, police ${alert.emergencyNumbers.police}.`
        : `Kiorly safety check: no answer after a home visit overran (${alert.visitId}). ${where}. Please call the clinician; ambulance ${alert.emergencyNumbers.ambulance}, police ${alert.emergencyNumbers.police}.`;
    await DevInboxRecorder.record({
      channel: "SMS",
      tenantId: this.tenantId,
      toAddress: this.toAddress,
      templateKey: alert.kind === "SOS" ? "home_visit.sos" : "home_visit.safety_alert",
      bodyText: body,
      variables: { visitId: alert.visitId, kind: alert.kind, contactId: alert.contactId },
      relatedId: alert.visitId,
    });
    return { deliveredAtMs: this.nowMs(), channel: this.channel };
  }
}

/** MODE=real placeholder: fails closed (delivery reported as failed => on-call is paged) until PG-13 wires an SMS/WhatsApp adapter. */
export class UnwiredRealSafetyAlertDispatcher implements SafetyAlertDispatcher {
  readonly channel = "SMS";
  async dispatch(): Promise<DispatchReceipt> {
    throw new Error("Real safety-alert delivery is not wired (Docs/KIORLY_NEEDS_HUMAN.md PG-13)");
  }
}
