# Kiorex connector (GT-06 hub)

How Kiorly talks to the **Kiorex** patient marketplace (HMAC marketplace API, commissions, deposits, outbox).

| Area | Doc | Status |
|------|-----|--------|
| Marketplace listings & slots | [KIOREX_MARKETPLACE.md](./KIOREX_MARKETPLACE.md) | **Shipped** (KX-01+) |
| Booking attribution | [BOOKING_ATTRIBUTION.md](./BOOKING_ATTRIBUTION.md) | **Shipped** (CR-02) |
| Commission fees | [KIOREX_FEES.md](./KIOREX_FEES.md) | **Shipped** (CR-04) |
| Commission charges & disputes | [KIOREX_COMMISSION_CHARGES.md](./KIOREX_COMMISSION_CHARGES.md) | **Shipped** (CR-03/CR-08) |
| Impact reports | [REPORTS_KIOREX_IMPACT.md](./REPORTS_KIOREX_IMPACT.md) | **Shipped** (RP-03) |
| OpenAPI consumer contract | [QA_KIOREX_CONTRACT.md](./QA_KIOREX_CONTRACT.md) | **Shipped** (QA-04; NH-019 Kiorex CI) |
| Sales kit / free calculator | [SALES_KIT.md](./SALES_KIT.md) · [PLANS_AND_PRICING.md](./PLANS_AND_PRICING.md) | **Shipped** (GT-01/GT-05) |
| Consent-based record sharing | [KX11_RECORD_SHARE.md](./KX11_RECORD_SHARE.md) | **Shipped** (KX-11; Rx PDF link added) |
| Liquidity counts `GET /marketplace/v1/analytics/slot-capacity` | below | **Shipped** (contracts 1.1.0) |
| Kiorex waitlist (`POST/GET/DELETE /marketplace/v1/waitlist`, offers accept/decline, `WAITLIST_OFFER`) | below | **Shipped** (contracts 1.1.0) |
| e-Prescription / lab order hand-offs (`PrescriptionIssued`, `LabOrderPlaced`) | [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) | **Shipped** (KCV203/204 Kiorly side; Pharmacy/Lab consumers: NH-026) |
| Mock providers and the dev inbox | [MOCK_PROVIDERS.md](./MOCK_PROVIDERS.md) | **Shipped** |

| Feature-flag control plane (snapshot client, `flag.changed` webhook, FEATURE_DISABLED) | [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) | **Shipped** (FF01–FF06) |
| Sign in with Kiorex Passport (OIDC, account link, back-channel logout) | [AUTH_SESSIONS.md](./AUTH_SESSIONS.md) | **Shipped** (KCV-201) |
| Local integration seed (marketplace client, webhook target, 3 live doctors) | below | **Shipped** (KX-DEV) |

**Data residency:** marketplace traffic follows the market cell; EG production stays Path A Frankfurt unless counsel signs Path B — [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md).

## Local Kiorex integration (dev seed, KX-DEV)

`npm run db:seed -w api` (also run by `db:setup`) idempotently ensures, via `apps/api/prisma/kiorex-dev.seed.ts`:

| Item | Value |
|------|-------|
| Marketplace client (`PlatformIntegrationClient`, scope `MARKETPLACE`) | key `kx_dev_client`, secret `kx_dev_secret_change_me` (HMAC headers per `marketplace-hmac.ts`) |
| Kiorly → Kiorex webhook target | The Kiorex target is env-driven (`OutboxDeliveryService`), not a table: set `KIOREX_OUTBOX_WEBHOOK_URL=http://localhost:4000/api/v1/webhooks/kiorly` and `KIOREX_OUTBOX_WEBHOOK_SECRET=kx_dev_webhook_secret` (already in `.env.example` and the local `.env`). Tenant-level `IntegrationWebhook` rows are *not* created to avoid double delivery. |
| Tenant | "Kiorex Dev Marketplace Group" (EG market, PRO, ACTIVE) |
| Clinics | Nile Family Clinic — Zamalek (Cairo), Pyramids Heart & Care Center — Dokki (Giza), with geo + AR/EN address |
| LIVE verified doctors | Dr Mona Fahmy (paediatrics, Cairo), Dr Karim Adel (dermatology, Cairo), Dr Hesham Nabil (cardiology, Giza); logins `kxdev.*@kiorly.dev` / `demo` |
| Schedule | Sat–Thu 09:00–13:00 and 16:00–20:00 (Africa/Cairo); Consultation 30 min + Follow-up 15 min, both `marketplaceBookable` ⇒ slots for the next 14 days |

Verify: `GET http://localhost:3000/api/v1/marketplace/v1/clinics` (signed) lists the two clinics; `kx-dev-seed.integration.test.ts` asserts idempotency, LIVE eligibility via the real recompute, and ≥ 20 slots over 14 days per doctor.

## Liquidity counts (slots/day)

`GET /marketplace/v1/analytics/slot-capacity?from=YYYY-MM-DD&to=YYYY-MM-DD[&clinicId][&clinicianId]` (HMAC, max 30 days, clinic-local
days, inclusive). For every **LIVE** listing it returns the open marketplace slots per day, computed by the same slot engine that serves
`/slots` (holds, bookings, daily cap, leave and blocked periods already excluded). Because types overlap in time, the count uses the
clinician's shortest marketplace-bookable type (`typeId`, `slotMinutes` are returned). Response: `{ from, to, items[{clinicId, clinicianId,
date, typeId, slotMinutes, openSlots}], totals[{date, openSlots}] }`. Counts only: no patient data.

## Waitlist (Kiorex patients)

| Call | Behaviour |
|------|-----------|
| `POST /marketplace/v1/waitlist` `{ externalRef, clinicId, clinicianId?, typeId?, preferredFrom?, preferredTo?, patient }` | Joins; **idempotent on `externalRef`**; needs a LIVE listing; creates/matches the patient and records marketplace consent |
| `GET /marketplace/v1/waitlist/:externalRef` | Entry state `WAITING \| OFFERED \| BOOKED \| CANCELLED` |
| `DELETE /marketplace/v1/waitlist/:externalRef` | Leaves; idempotent; withdraws a pending offer |
| `POST /marketplace/v1/waitlist/offers/:offerId/accept` / `decline` | Patient answers a `WAITLIST_OFFER`. Accept books the slot as a `KIOREX_MARKETPLACE` appointment, `externalReference` = the waitlist ref, status CONFIRMED (so commission, events and cancellation policy apply as for any Kiorex booking) |

FS-03 auto-fill (`clinic.waitlist_autofill`) treats Kiorex-sourced entries like any other, in order, but delivers the offer as the
**`WAITLIST_OFFER` outbox event** `{ offerId, waitlistRef, clinicId, clinicianId, typeId?, startsAt, endsAt?, expiresAt, feeAmount }`
instead of WhatsApp, so a clinic-side phone is not required. Offers expire after the market's hold window (default 15 min); a late
accept returns `UNAVAILABLE` and never double-books. Migration `20261120010000_kxw_kiorex_waitlist` (additive columns `source`,
`externalRef`, `platformIntegrationClientId`).

## Contract version

`@kiorex/contracts` **1.1.0** (additive minor; `npm run pack:local` in kiorex-contracts): the endpoints above, events `WAITLIST_OFFER` and
`LabOrderPlaced`, `PrescriptionIssued` now emitted, `PRESCRIPTION_SHARED.pdf`. The OpenAPI file here and in kiorex-contracts are kept identical
(drift test).

## Rev 2.3 additions (KX-09 v2.3, kiorex-contracts 1.5.0) - Kiorly side

`apps/api/openapi/marketplace.openapi.json` is the 1.2.0 spec from contracts 1.5.0 (byte-identical; the drift test is back to equality). Both editions (Clinic and Nurse) use the same client and endpoints.

| Contract | Kiorly behaviour |
|---|---|
| `GET /providers` | adds `profession`, `edition`, `serviceLocations[]`, `coverageDistricts[]`, `verification.register`, `assignsClinician` (agencies); HOME is published only while `clinic.home_visits` is effective and the clinician takes home visits; fees carry `serviceLocation` and a separate `homeSurcharge` (never part of `amount`, BR56) |
| `GET /clinics/:id/slots` | optional `serviceLocation`, `district`, `lat`, `lng`; HOME needs `district` (400 `DISTRICT_REQUIRED`); slots carry `serviceLocation` + `district`; **422 `OUT_OF_COVERAGE`**; OFF flag = 403 `FEATURE_DISABLED` |
| `POST /holds` | `visitAddress` required for HOME types (422 `VISIT_ADDRESS_REQUIRED`), coverage checked, stored encrypted, never echoed |
| `POST /bookings` | address carried from the hold (or sent again); every HOME rule re-checked; zone changed after the hold => 422 `OUT_OF_COVERAGE` and the hold is released (KX-09 §08); response has `serviceLocation` |
| Events | `HOME_VISIT_ASSIGNED` (name, badge, profession; no phone/photo yet), `HOME_VISIT_EN_ROUTE`, `HOME_VISIT_ABORTED_UNSAFE` (`noShow:false`, `HOLD_FOR_REVIEW`), `SAFETY_ALERT_RAISED` (Kiorex bookings; `SafetyAlert` aggregate), `CARE_PLAN_CONFIRMED/_ENDED` (plans with a `requestRef`), `ReferralIssued` / `MedicationOrderShared` builders; `CHECKED_IN`/`COMPLETED` of HOME visits add `serviceLocation: "HOME"` (+ `arrivedAt`); in-clinic payloads are unchanged. Builders are validated against the vendored contract schemas (`apps/api/openapi/events/`) |

| `POST /lab-orders/:orderId/status` (contracts 1.6.0, KNLAB01) | Kiorex relays the lab status + sanitized custody (+ report id and secure link on release) of a Nurse-edition `LabOrderPlaced` hand-off; idempotent, headline status monotonic (stale push = 200 `applied:false`), no results, no PHI. `LabOrderPlaced` additionally carries the optional Nurse fields (`originEdition`, `prescriberName`, `identifiersChecked`, `patient`, `nurseCollection`) |

Not implemented: `POST /care-plan-requests` (P3 draft). Docs: [HOME_VISITS.md](./HOME_VISITS.md), [NURSE_EDITION.md](./NURSE_EDITION.md).
