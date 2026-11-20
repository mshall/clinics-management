# Runbook: SAFETY_ALERT_UNDELIVERED (critical)

A home-visit safety alert (HVSAF01 timer expiry, HVSAF02 SOS, HVSAF04 unsafe abort) was not delivered within 60 s, failed on every channel,
or was delivered but not acknowledged by the organisation safety contact within 10 minutes (KX-09 §08, KX-23 stop-ship).

## Symptoms

- `safety_alert.delivery_failed` or `safety_alert.escalated` in the application log (alarms in `infra/tofu/modules/aws/safety-alerts`), or a `HomeSafetyAlert` row with `status IN ('FAILED','ESCALATED')`.
- Alert latency over 60 s (`safety_alert.delivered` with `deliveryLatencyMs > 60000`).

## First actions

1. Find the alert: `HomeSafetyAlert` (ids, times, channel, latency only; no address or patient data is stored on the alert).
2. Phone the organisation safety contact (Tenant.safetyContactPhone, via the platform support console) and the clinician on the visit. Ambulance 123, police 122.
3. For a Kiorex booking tell Kiorex ops on-call (the `SAFETY_ALERT_RAISED` outbox event is the Kiorex-side trigger; `deliverTo` includes `KIOREX_OPS`).
4. Mock mode (`KIORLY_PROVIDER_MODE_SMS=mock`): the alert is in the dev inbox, not a phone. Real channels fail closed until Provider go-live PG-13.
5. After handling, acknowledge (`POST /api/v1/home-visits/safety-alerts/:id/ack`) then resolve (`/resolve`).

## Escalation

Safety on-call primary, then secondary (rota is NEEDS_HUMAN, gate GHV2). The CMO is informed of every SOS and every undelivered alert.
