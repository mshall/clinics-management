# Kiorex marketplace connector (KX-01)

| Item | Status |
|------|--------|
| Platform integration client (HMAC) | **Done** |
| Per-doctor `MarketplaceListing` | **Done** |
| `/marketplace/v1` API namespace | **Done** |
| OpenAPI `apps/api/openapi/marketplace.openapi.json` | **Done** |
| Clinic UI listing status | **Done** |
| KX-02 Provider profile publishing | **Done** |
| KX-03 Canonical slot engine | **Done** |
| KX-04 Booking intake (holds, idempotency) | **Done** |
| KX-05 Transactional outbox & status events | **Done** |
| KX-06 Reschedule & cancellation policies (both directions) | **Done** |

## Platform client

`PlatformIntegrationClient` has no `tenantId`. Scope `MARKETPLACE`. Auth headers:

- `X-Kiorly-Client-Key`, `X-Kiorly-Client-Secret`
- `X-Kiorly-Timestamp`, `X-Kiorly-Nonce`, `X-Kiorly-Signature` (HMAC-SHA256 over canonical string)

Optional `ipAllowlist` on the client row.

## Listing lifecycle

`MarketplaceListing` is unique per `(clinicId, clinicianId)`. Status: `DRAFT`, `PENDING_VERIFICATION`, `LIVE`, `PAUSED`.

**LIVE** requires: doctor `VERIFIED`, subscription not `READ_ONLY`/`SUSPENDED`, ≥1 `marketplaceBookable` appointment type, clinician availability template with slots.

`pausedReason`: `owner`, `billing`, `verification`, `quality`, etc.

## API

Public base: **`/marketplace/v1`** (excluded from `api/v1` prefix). Org UI: `GET /api/v1/marketplace/listings?clinicId=`.

| Method | Path |
|--------|------|
| GET/PUT | `/api/v1/marketplace-listings/:id/profile` |
| GET | `/marketplace/v1/providers?updatedSince=&page=&pageSize=` |
| GET | `/marketplace/v1/clinics/:clinicId/slots?clinicianId&typeId&from&to` |

Marketplace calls carry `clinicId`; tenant resolves from listing rows.

## KX-04 booking intake

- `POST /marketplace/v1/holds` — 5-minute slot hold (`externalRef` unique).
- `DELETE /marketplace/v1/holds/:id`
- `POST /marketplace/v1/bookings` — header **`Idempotency-Key`** = Kiorex booking id → `Appointment.externalReference` + `platformIntegrationClientId`.
- `GET /marketplace/v1/bookings/:externalRef`
- Patient match: normalized phone → nationalId → create; **never merge** conflicting national IDs.
- `bookingSource` `KIOREX_MARKETPLACE`, `attributionJson`, `acquisitionChannel` `KIOREX`, marketplace + reminder consents.
- Clinic `marketplaceBookingAutoConfirm`: auto-`CONFIRMED` vs front-desk queue (`SCHEDULED` + `marketplaceConfirmationDueAt`); timeout job enqueues **`MARKETPLACE_BOOKING_CONFIRM_TIMEOUT`**.
- **`409` `SLOT_TAKEN`** includes 3 nearest alternative slots.

## KX-03 slots

- `SlotService.getSlots` — shared by **INTERNAL** (Kiorly UI, waitlist) and **MARKETPLACE** (Kiorex).
- Inputs: `ClinicianAvailabilityTemplate.weekJson` / `blockedJson`, HR leave, non-cancelled appointments (with FS-01 buffers), appointment type duration, room capacity, clinic timezone (Luxon), `marketplaceDailyCap` on template.
- Marketplace channel: `marketplaceBookable` types only, `minNoticeMinutes`, `maxDaysAhead`, daily cap.
- 60s per clinician-day cache; invalidation + **`SLOTS_CHANGED`** outbox on appointment / template changes.
- Org API: `GET /api/v1/scheduling/slots?...`

## KX-02 profiles

- Rich fields live in `MarketplaceListing.profileJson`; clinic `latitude`/`longitude` on `Clinic`.
- **80% completeness** required for `LIVE` (`MARKETPLACE_BLOCKER.PROFILE`).
- Display name or specialty change on a **verified** doctor re-opens verification (`PENDING`).
- Each successful profile save enqueues **`PROVIDER_PROFILE_UPDATED`** on `OutboxEvent`.

## KX-05 transactional outbox

- `OutboxEvent` is written in the **same DB transaction** as appointment status, listing recompute, commission charge, slots, and profile changes.
- **Dispatcher** (5s): ordered by `aggregateType` + `aggregateId`, exponential backoff, **DEAD** after 8 attempts, lag error log when oldest `PENDING` > **2 minutes**.
- **Targets:** `KIOREX` (env `KIOREX_OUTBOX_WEBHOOK_URL` + `KIOREX_OUTBOX_WEBHOOK_SECRET`) or `TENANT_WEBHOOK:<id>` for integration webhooks.
- **HMAC** body: `{ eventId, type, aggregateType, aggregateId, occurredAt, data }` with headers `X-Kiorly-Event-Id`, `X-Kiorly-Signature`.
- **Event set:** `APPOINTMENT_CONFIRMED`, `RESCHEDULED`, `CANCELLED_BY_CLINIC`, `CANCELLED_BY_PATIENT`, `CHECKED_IN`, `CHECK_IN_REVERTED`, `COMPLETED`, `NO_SHOW`, `PROVIDER_PROFILE_UPDATED`, `LISTING_STATUS_CHANGED`, `SLOTS_CHANGED`, `COMMISSION_CHARGE_CREATED`, `COMMISSION_CHARGE_REVERSED`.
- **Governance:** Admin → **Outbox** tab; `GET/POST /api/v1/admin/outbox-events` (+ `/summary`, `/:id/retry`).
- OpenAPI webhook contract: `apps/api/openapi/marketplace.openapi.json` → `webhooks.kiorexOutboxEvent`.

## KX-06 reschedule & cancellation policies

- **Policy** (hours before start): `patientCancelMinHours`, `patientRescheduleMinHours`, `depositRefundMinHours`, `maxPatientReschedules`. Default from market pack `commercialConfig.kiorex.cancellationPolicy` (optional; code default 12 / 12 / 24 / 2), clinic partial override in `Clinic.kiorexCancellationPolicy`.
- **Settings:** `GET /api/v1/kiorex/settings?clinicId=` and `PUT /api/v1/kiorex/settings` `{ clinicId, cancellationPolicy }` (`null` resets to market default) — clinic admins only, audited `kiorex.settings.cancellation_policy_updated`. UI: **Kiorex** tab → policy card.
- **Patient side (Kiorex):** `POST /marketplace/v1/bookings/:ref/cancel` `{ reason? }` and `POST /marketplace/v1/bookings/:ref/reschedule` `{ startsAt, endsAt?, holdId? }`. Outside the window → **`422`** `CANCELLATION_WINDOW_CLOSED` / `RESCHEDULE_WINDOW_CLOSED` / `RESCHEDULE_LIMIT_REACHED` / `BOOKING_NOT_CHANGEABLE` (rejections audited). Cancel decides `depositRefundable` server-side (`≥ depositRefundMinHours`) and emits `CANCELLED_BY_PATIENT` with it; reschedule checks min notice, horizon, overlaps and holds, increments `rescheduleCount` and emits `RESCHEDULED`.
- **Clinic side:** cancelling a `KIOREX_MARKETPLACE` / `KIOREX_WHATSAPP` / `CLINIC_LINK` booking (`PATCH /appointments/:id` or `/status`) requires `cancellationReason` (≥3 chars, else `400 CANCELLATION_REASON_REQUIRED`); deposit is always refundable; `CANCELLED_BY_CLINIC` carries the reason for the patient; audit `appointment.cancelled_by_clinic` with the reason.
- Confirmation-timeout cancellations are stamped `cancelledBy = SYSTEM`, deposit refundable.
- Appointment fields: `cancelledAt`, `cancelledBy`, `cancellationReason`, `depositRefundable`, `rescheduleCount`.

## Tests

- `marketplace-listing-eligibility.node.test.ts`
- `kx01-marketplace-access.integration.test.ts`
- `kx02-provider-profile.integration.test.ts`
- `provider-profile-completeness.node.test.ts`
- `qa04-marketplace-openapi.node.test.ts`
- `kx03-slot-engine.node.test.ts`
- `kx03-slot-performance.node.test.ts`
- `kx03-slot.integration.test.ts`
- `kx04-marketplace-booking.integration.test.ts`
- `outbox-lag.node.test.ts`
- `outbox-delivery.node.test.ts`
- `kx05-outbox.integration.test.ts`
- `kx06-booking-policy.node.test.ts`, `kx06-cancellation-policy.integration.test.ts`

## Follow-ups

- Platform admin UI for `PlatformIntegrationClient` issuance
- Webhook delivery for marketplace client (reuse outbox)
- Auto-sync listing on verification / subscription / scheduling changes
- KX-05 outbox consumer to push profiles to Kiorex
- KX-04…KX-07 additional marketplace routes