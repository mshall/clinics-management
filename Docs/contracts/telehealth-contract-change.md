# Proposed `kiorex-contracts` change: telehealth (ADR-039)

Target: `kiorex-contracts` minor bump (additive, proposed 1.9.0). **This repo does not edit that package**; this file is the PR text. Clinic carries local types until it lands (search `TODO(contracts)`), and `ff01-registry.node.test.ts` tolerates the pending flag through `PENDING_CONTRACT_FLAG_KEYS`.

## 1. `openapi/kiorly-marketplace.v1.openapi.json`

```diff
 "ServiceLocation": {
   "type": "string",
-  "enum": ["IN_CLINIC", "HOME"],
-  "description": "VisitType.serviceLocation (ADR-030). VIDEO is reserved and not part of this contract."
+  "enum": ["IN_CLINIC", "HOME", "VIDEO"],
+  "description": "VisitType.serviceLocation (ADR-030, ADR-039). VIDEO = telehealth (derived visitType TELEHEALTH); slots/holds/bookings exist only while flag telehealth.video is effective and the doctor offers telehealth."
 }
+"TelehealthBlock": {
+  "type": "object",
+  "required": ["sessionId", "status", "joinUrl", "opensAt", "closesAt"],
+  "properties": {
+    "sessionId": { "type": "string" },
+    "status": { "type": "string", "enum": ["SCHEDULED", "WAITING", "ACTIVE", "ENDED", "CANCELLED", "MISSED"] },
+    "mode": { "type": "string", "enum": ["VIDEO", "AUDIO"] },
+    "linkVersion": { "type": "integer", "minimum": 1 },
+    "joinUrl": { "type": "string", "format": "uri", "description": "Patient bearer link /v/<token>. Unchanged by reschedule; replaced only by staff 'Regenerate link' (linkVersion+1)." },
+    "opensAt": { "type": "string", "format": "date-time", "description": "Computed from the CURRENT appointment start: start - 10 min." },
+    "closesAt": { "type": "string", "format": "date-time", "description": "Scheduled end + 60 min." }
+  }
+}
```
Additive optional properties on the booking response (`GET/POST /bookings...`, reschedule, cancel): `visitType` (`"TELEHEALTH"` when `serviceLocation = VIDEO`) and `telehealth` (`TelehealthBlock`). `PublishedFee.serviceLocation` and `PublishedProvider.serviceLocations[]` may now carry `VIDEO`. `GET /clinics/{clinicId}/slots?serviceLocation=VIDEO` accepted; each slot carries `serviceLocation: "VIDEO"`, `district: null`. Errors: `403 FEATURE_DISABLED {key:"telehealth.video"}`, `403 TELEHEALTH_NOT_OFFERED`, `402/409` unchanged.

## 2. Existing events gain an optional `telehealth` block

`APPOINTMENT_CONFIRMED`, `RESCHEDULED`, `CANCELLED_BY_CLINIC`, `CANCELLED_BY_PATIENT`, `CHECKED_IN` (`data.telehealth`: `TelehealthBlock`, absent for in-person visits). `CHECKED_IN` additionally may carry `attendedVia: "TELEHEALTH" | "MANUAL"`.

## 3. New event schemas (`events/`, `x-producer: kiorly-clinic`, `x-status: v2-draft`)

Envelope as everywhere (`{eventId,type,aggregateType:"TelehealthSession",aggregateId,occurredAt,target,data}`); the outbox `type` strings are lowercase dotted.

`telehealth.session.created.schema.json` `data`:
```json
{ "sessionId": "cmx1", "appointmentId": "cma1", "clinicId": "cmc1", "externalReference": "kx_bk_123",
  "serviceLocation": "VIDEO", "visitType": "TELEHEALTH", "status": "SCHEDULED", "mode": "VIDEO", "linkVersion": 1,
  "joinUrl": "https://app.kiorly.com/v/eyJz...", "opensAt": "2026-12-01T09:50:00.000Z", "closesAt": "2026-12-01T11:30:00.000Z" }
```
`telehealth.session.started` `data`: `{ sessionId, appointmentId, clinicId, externalReference, serviceLocation:"VIDEO", visitType:"TELEHEALTH", status:"ACTIVE", startedAt }`

`telehealth.session.ended` `data`: `{ ...base, status:"ENDED", endedAt, endReason: "ENDED_BY_PARTICIPANT"|"DISCONNECTED"|"WINDOW_CLOSED", attended: boolean }`

`telehealth.session.missed` `data`: `{ ...base, status:"MISSED", missedAt, absentParty: "PATIENT"|"CLINICIAN", patientCharged: false (const), needsStaffReview: boolean }`. Doctor absent => `needsStaffReview: true`, appointment stays open and the patient is not charged; patient absent => the usual `NO_SHOW` event follows.

Required in every schema: `sessionId`, `appointmentId`, `clinicId`, `serviceLocation` (const `VIDEO`), `visitType` (const `TELEHEALTH`), `status`; `externalReference` nullable. Never PHI beyond ids; `joinUrl` is a bearer link (Kiorex shows it to the booking patient only).

## 4. `flags/catalogue.json`

```json
{ "key": "telehealth.video", "product": "kiorly-clinic", "scopes": ["global", "market", "org"], "class": "Module",
  "dependsOn": [], "launchLocked": false,
  "descriptionEn": "Telehealth video visits (peer-to-peer WebRTC, no recording)",
  "descriptionAr": "زيارات الفيديو عن بُعد (اتصال مباشر بين الطرفين دون تسجيل)",
  "whenOffEn": "No telehealth slots on Kiorex, no visit-type option, no new sessions; scheduled visits stay visible with a banner",
  "whenOffAr": "لا مواعيد فيديو على كيوريكس ولا خيار نوع الزيارة ولا جلسات جديدة؛ تبقى الزيارات المجدولة ظاهرة مع تنبيه" }
```
Note: Kiorex's own `kiorex.telemedicine` (launch-locked) is separate; Kiorex should treat `telehealth.video` as the Clinic-side capability and keep its Daily `VideoAdapter` dormant for `visitType=TELEHEALTH` bookings.

## 5. Checklist for the PR

- [ ] Schemas + OpenAPI diff above, examples under `examples/`, CHANGELOG 1.9.0 (additive).
- [ ] Regenerate `src/generated/`; contract tests for the four events.
- [ ] After merge: remove `telehealth.video` from `PENDING_CONTRACT_FLAG_KEYS` (`apps/api/src/feature-flags/ff01-registry.node.test.ts`), refresh `apps/api/openapi/marketplace.openapi.json` and `kiorex-consumer-contract.json` snapshots, add the event schema validation to `src/telehealth/telehealth-events` tests.
- [ ] Kiorex: render `telehealth.joinUrl` for TELEHEALTH bookings (patient web / Expo WebView), stop creating Daily rooms for them, ignore-safe for unknown event types today (default IGNORED).
