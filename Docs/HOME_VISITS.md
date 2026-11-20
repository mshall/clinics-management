# Home visits (HVCFG / HVBK / HVPRV / HVEXE / HVSAF / HVFEE / HVRPT)

KX-05 Rev 2.3 §08 · ADR-030 · built on `@kiorly/field-visit` ([FIELD_VISIT.md](./FIELD_VISIT.md)) behind `FieldVisitPort`.
Code: `apps/api/src/home-visits/`. Web: `apps/web/src/features/home-visits/today-route-page.tsx` (`/home-visits/today`).

**Gates are human.** `clinic.home_visits` is launch-locked behind **GHV1** (counsel memo) and **GHV2** (CMO-signed safety protocol); it is
effective only when the Kiorex control plane records the evidence. Code never records a gate (NH-033).

## What the flag gates, and what it never gates (ADR-025)

| Gated by `clinic.home_visits` (NEW capability) | Never gated (booked visits are honoured; safety is not a flag) |
|---|---|
| New HOME bookings (front desk `POST /home-visits/bookings`, Kiorex holds/slots/bookings), configuring a HOME visit type, enabling a clinician for home visits, publishing HOME on Kiorex | Reads, `GET /home-visits/route` (list), depart / arrive / finish, **SOS**, safety prompt answer, **unsafe-abort**, safety alerts, address masking, geostamp purge |
| `clinic.home_route_view` OFF = list view only (no legs, no map links) · `clinic.home_dispatch` OFF = manual assignment (`POST /assign` still works) | |

OFF => `403 FEATURE_DISABLED {key, scope}`. The safety code paths contain no flag reads; `ff-safety-never-flags.node.test.ts` fails CI if one appears.

## Requirements

| ID | Where | Notes |
|---|---|---|
| HVCFG01 | `PUT /home-visits/appointment-types/:id` | `AppointmentType.serviceLocation` IN_CLINIC\|HOME; travel buffers reuse `bufferBefore/AfterMin` (default **30/30**), `homeSurchargeAmount`, deposit |
| HVCFG02/03 | `PUT /home-visits/settings/:clinicianId` | `ClinicianHomeSettings`: coverage districts (market-pack list when present), optional `maxTravelMinutes` + `startDistrictId`, `dailyVisitCap`, home hours; one calendar with clinic sessions |
| HVBK01 | slot filter + `assertBookable` | coverage (422 `OUT_OF_COVERAGE`), daily cap, home hours, travel feasibility between booked visits (mock matrix) on top of the slot engine's buffers |
| HVBK02 | `HomeVisitBookingService` | front desk books under the same rules (needs a confirmed address to reach CONFIRMED) |
| HVBK03 | holds / bookings | Kiorex `visitAddress` on the hold, stored **encrypted** (`SlotHold.visitAddressCiphertext` -> `HomeVisit.addressCiphertext`), never echoed |
| HVBK06 | settings | clinician-owned patient-gender restriction (BR60); a manager cannot set it for someone else |
| HVPRV01 | `HomeVisitPrivacyService` | AES-256-GCM, tenant id as AAD (`HOME_VISIT_ADDRESS_ENCRYPTION_KEY`, required in production); visible to the **assigned** clinician and org admins from CONFIRMED; **masked 24 h after the visit** (ciphertext wiped by the 15 s scheduler / `POST /internal/jobs/home-visit-address-mask`); phone follows the same rule; audit metadata redacts `visitAddress`, `lat`, `lng`, `liveLocation` |
| HVEXE01 | `GET /home-visits/route` | visits in time order; with `clinic.home_route_view` + entitlement `home_route_view` (Pro+): travel legs + navigation link (only when the address is visible) |
| HVEXE02 | `HomeVisitExecService` | **Arrived = check-in** (`AppointmentsService.updateStatus(CHECKED_IN)`: attendance and commission as in clinic), **Finished = complete** (usual guards: finalize the encounter first). Field events belong to the assigned clinician only |
| HVEXE03 | cashier | cash at home reconciles through the existing cashier shift (MN03); agencies see cash per nurse (`/nurse/agency/pay/:id`) |
| HVSAF01 | `HomeVisitSafetyService.tick` | prompt at planned end + 30 min, alert to the **organisation safety contact** (`Tenant.safetyContactName/Phone`) 10 min later without an answer; tick every 15 s; claimed with conditional updates (no double send); not acknowledged in 10 min => `ESCALATED` (on-call + owner notice) |
| HVSAF02 | `POST /home-visits/:id/sos` | live location to the safety contact, response shows **123 / 122**; geostamp stored coarse |
| HVSAF03 | `checkFirstHomeVisit` | first home visit to a new patient needs a Kiorex-verified phone (Kiorex bookings) or a deposit on the type (BR51/BR54) |
| HVSAF04 | `abort-unsafe` | ends with a reason; **never a no-show** (package rejects it); appointment closed WITHOUT cancel/no-show events; Kiorex gets `HOME_VISIT_ABORTED_UNSAFE` (`noShow:false`, `depositAction: HOLD_FOR_REVIEW`, category only); incident logged (`ClinicalIncident`); safety contact alerted |
| HVFEE01 | `Appointment.homeSurchargeAmount` | separate field/line; Kiorex shows base + `homeSurcharge`; **never enters S or C** (`feeAmount` stays the base for commission and revenue share) |
| HVRPT01 | `GET /home-visits/reports` | in-clinic vs home: visits, revenue (+ surcharge), travel minutes, cancellations, geostamp-trail % (success metric >= 98%) |

## Geostamps and retention

`HomeVisitGeostamp` rows: coarse (~1 km), one per state change (+ SOS). `POST /api/v1/internal/jobs/geostamp-retention-purge` with
`X-Internal-Job-Key` (= `INTERNAL_JOB_KEY`, closed with 503 when unset) removes lat/lng older than **12 months** and keeps the district;
batched (1000/call, returns `remaining`) and idempotent. Infra owns only the clock (`scheduled_jobs["geostamp-retention-purge"]`, `enabled = false` until the DPO signs off).
Also `POST /internal/jobs/home-visit-address-mask` and `/home-visit-safety-tick` for external schedulers.

## Safety alerts: log events and delivery

One JSON line per event on stdout (PHI-free, whitelist-built in `safety-log.ts`), exactly the contract of `infra/tofu/modules/aws/safety-alerts`:
`{"event":"safety_alert.raised","alertId"}` · `{"event":"safety_alert.delivered","alertId","channel","deliveryLatencyMs"}` ·
`{"event":"safety_alert.delivery_failed","alertId","channel"}` (+ `safety_alert.escalated`). Delivery is **MOCK** by default (dev inbox SMS to the
safety contact; real channels fail closed until PG-13). A failed or late delivery pages on-call (`SAFETY_ALERT_UNDELIVERED`, runbook
`runbooks/SAFETY_ALERT_UNDELIVERED.md`). No safety contact configured = the alert is `FAILED` and paged, never silent.
Kiorex ops are told through the outbox (`SAFETY_ALERT_RAISED`, Kiorex bookings only).

## Maps / routing (MODE=mock|real)

`RouteMapsPort` (`KIORLY_PROVIDER_MODE_MAPS`, default **mock**): deterministic symmetric district travel matrix, mock navigation links. Real = Amazon Location
(`infra/tofu/modules/aws/location`, behind the same port; fails closed until written; PG-10).

## Tests

`home-visits/hv01-home-visits.integration.test.ts` (flag-OFF honours booked visits + safety, coverage, cap, booking, privacy/leak tests, lifecycle, unsafe-abort,
**safety drill** with the log events, SOS, retention, dispatch guard, route, reports) · `home-visit-rules.node.test.ts` · `home-visit-events.node.test.ts`
(payloads vs the contracts 1.5.0 JSON Schemas; no address/coordinates/phone) · `marketplace/kx23-home-connector.integration.test.ts`.

## Known limits / follow-ups

- District list is free-form until the market pack ships one (NH-040); polygons later.
- Cash-at-home reconciliation uses the existing cashier shift; no separate per-visit cash screen yet.
- `clinic.home_route_view` map rendering in the web is a navigation link list (no embedded map until the real maps adapter exists).
- Kiorex-side consumption of the events is kiorex-platform's job (`fake-kiorly.ts` there mirrors the shapes).
