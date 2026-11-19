# Kiorex marketplace connector (KX-01)

| Item | Status |
|------|--------|
| Platform integration client (HMAC) | **Done** |
| Per-doctor `MarketplaceListing` | **Done** |
| `/marketplace/v1` API namespace | **Done** |
| OpenAPI `apps/api/openapi/marketplace.openapi.json` | **Done** |
| QA-04 contract tests + consumer pin | **Done** (Kiorex CI wire-up: NH-019) — see [QA_KIOREX_CONTRACT.md](./QA_KIOREX_CONTRACT.md) |
| Clinic UI listing status | **Done** |
| KX-02 Provider profile publishing | **Done** |
| KX-03 Canonical slot engine | **Done** |
| KX-04 Booking intake (holds, idempotency) | **Done** |
| KX-05 Transactional outbox & status events | **Done** |
| KX-06 Reschedule & cancellation policies (both directions) | **Done** |
| KX-07 Kiorex Pay deposits & prepayments into clinic billing | **Done** |
| KX-08 Verified reviews after completed visits | **Done** |
| KX-09 Clinic-branded booking page & link (commission-free) | **Done** (Kiorex widget origin + `kiorly.link` domain: NH-008) |
| KX-10 Kiorex tab inside Kiorly (settings + performance) | **Done** |

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

## KX-07 Kiorex Pay deposits

- `POST /marketplace/v1/bookings/:ref/deposit-paid` `{ amount, currency?, paymentRef, paidAt? }` — Kiorex collected a deposit; Kiorly records a held `PatientDeposit` (`source=KIOREX_PAY`) on the appointment. Idempotent on `paymentRef`.
- `POST /marketplace/v1/payouts` `{ payoutRef, clinicId?, amount, depositPaymentRefs? }` — Kiorex paid the clinic; idempotent on `payoutRef`.
- At check-in the deposit becomes a `BillingPayment` via `postRevenue`; cancellations release or forfeit it per the KX-06 `depositRefundable` decision; no-shows forfeit. Details and money rules: [CLINIC_BILLING.md](./CLINIC_BILLING.md#kiorex-pay-deposits-kx-07).
- Clinic UI: deposit badge on appointments; **Kiorex** tab → "Kiorex Pay deposits & payouts" card (`GET /api/v1/billing/kiorex-payouts`).
- FS-04: clinics can also send a Kiorex Pay **deposit link** for any booking; Kiorex confirms with `POST /marketplace/v1/deposit-links/:token/paid` `{ amount, paymentRef }` (see [FRONT_DESK.md](./FRONT_DESK.md#deposits--payment-links-for-high-risk-bookings-fs-04)).

## KX-08 verified reviews

- **Kiorex is the single source of reviews.** When a `KIOREX_MARKETPLACE` / `KIOREX_WHATSAPP` / `CLINIC_LINK` appointment moves to **COMPLETED**, the outbox emits **`REVIEW_INVITATION_ELIGIBLE`** (same transaction) and Kiorex sends the invitation. No-shows, cancellations and non-Kiorex bookings never emit it (`isReviewInvitationEligible`).
- **Sync back:** `POST /marketplace/v1/reviews/aggregate` `{ clinicId, clinicianId, averageRating, reviewCount, reviews?[] }` upserts `KiorexRating` (per doctor per clinic) and `KiorexReview` rows. A review is accepted only if its `appointmentId` is a completed Kiorex visit of that doctor at that clinic; others come back in `rejected` as `NOT_A_COMPLETED_VISIT`. Kiorex moderation (`moderationStatus: HIDDEN` for abuse / PHI) hides a review in Kiorly. Audited `marketplace.reviews.synced`.
- **Clinic:** `GET /api/v1/kiorex/ratings?clinicId=` (doctor scores + 20 latest visible reviews) and `POST /api/v1/kiorex/reviews/:id/reply` `{ text }` → `REVIEW_REPLY_POSTED` outbox to Kiorex, audited `kiorex.review.replied`. UI: **Kiorex** tab → Ratings & reviews card.
- **Reports:** `GET /reports/performance` returns `kiorexRating { averageRating, reviewCount }` (review-weighted; physicians see their own) shown as a KPI tile.
- `SatisfactionSurveyResponse` is **retired** (no writers; table kept, no data dropped).

## KX-09 clinic booking page & link

- **Slugs:** `Clinic.bookingSlug` and `MarketplaceListing.bookingSlug` (per doctor), unique and sharing one namespace. Assigned on first view of the Kiorex tab from the English name (fallback `clinic` / `doctor` + suffix); owners can change them (`3–40` lowercase letters/digits/hyphens, reserved words blocked). Audited `kiorex.booking_link.slug_updated`.
- **Clinic:** `GET /api/v1/kiorex/booking-link?clinicId=` and `PUT /api/v1/kiorex/booking-link` `{ clinicId, slug, listingId? }` (`409 BOOKING_SLUG_TAKEN`, `400 INVALID_BOOKING_SLUG`). UI: **Kiorex** tab → "Your booking link" (copy, QR, WhatsApp/native share, per-doctor links, A4/A5 AR/EN QR poster, "Book on Google" guide).
- **Public:** `GET /api/v1/public/booking-pages/:slug` (no auth, no patient data) → clinic branding (logo, invoice colour, address, phone), LIVE doctors, marketplace-bookable visit types and the Kiorex widget URL with `channel=CLINIC_LINK`. Web page `/b/:slug`.
- **Booking:** Kiorex posts `POST /marketplace/v1/bookings` with `channel: "CLINIC_LINK"` (+ optional `bookingPageSlug`, must belong to that clinic/doctor → else `400 BOOKING_PAGE_MISMATCH`). The appointment gets `bookingSource = CLINIC_LINK`, which `isCommissionChargeableBooking` never charges. Slots, holds, policies, confirmation timeouts and outbox events are shared with marketplace bookings.
- **New-patient stamp:** marketplace/link bookings now stamp `isNewPatientAtBooking` at intake (previously missing, so Kiorex marketplace bookings were never commissionable at check-in).
- **Config:** `BOOKING_LINK_BASE_URL` (default `${APP_WEB_URL}/b`, e.g. `https://kiorly.link`) and `KIOREX_BOOKING_WIDGET_URL` (until set, the page shows "Call to book").

## KX-10 Kiorex tab (settings + performance)

- **Settings:** `GET /api/v1/kiorex/settings?clinicId=` now also returns `autoConfirm`, `doctors[]` (listing status, owner pause, blockers, profile completeness, ON-03 verification status, daily cap) and `appointmentTypes[]` (bookable on Kiorex, min notice, horizon, deposit). `PUT /api/v1/kiorex/settings` accepts `autoConfirm`, `doctors[{ listingId, listed?, dailyCap? }]` and `appointmentTypes[{ id, marketplaceBookable?, minNoticeMinutes?, maxDaysAhead?, depositAmount? }]` alongside `cancellationPolicy`. Limits: cap 0–200 (needs an availability template), notice ≤ 14 days, horizon 1–365 days, deposit 0–visit fee. Each change is audited (`kiorex.settings.auto_confirm_updated`, `.listing_toggled`, `.daily_cap_updated`, `.appointment_type_updated`) and slot caches are invalidated (`SLOTS_CHANGED` to Kiorex). Reuses existing fields — no new settings columns.
- **Performance:** `GET /api/v1/kiorex/overview?clinicId=&period=YYYY-MM` (clinic admins) → profile views, bookings (by channel: Kiorex / WhatsApp / clinic link), attended, no-shows, cancelled, new patients (attended + new at booking), commission (active charges, split confirmed vs pending), daily series, Kiorex rating, and tenant-wide CR-07 free progress + subscription offset from the settlement preview. Appointments bucket by visit start, charges by attendance, UTC calendar month (same as settlement).
- **Profile views:** Kiorex pushes `POST /marketplace/v1/analytics/profile-views` `{ clinicId, items[{ clinicianId, date, views }] }` (≤400 items; re-sending a day replaces it) into `KiorexProfileViewDaily`.
- **UI:** Kiorex tab → Performance (month picker, KPI tiles, free-progress bar, bookings/attended/views chart, RTL-aware), Booking on Kiorex (auto-confirm, per-doctor listed toggle + daily cap + profile editor link + verification, per-type rules), Your booking link, Ratings, Cancellation policy.

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
- `kx08-review-invitation.node.test.ts`, `kx08-verified-reviews.integration.test.ts`
- `kx09-booking-slug.node.test.ts`, `kx09-clinic-booking-link.integration.test.ts`, e2e `kx09-booking-link.spec.ts`
- `kx10-overview.node.test.ts`, `kx10-kiorex-tab.integration.test.ts` (numbers reconcile with appointments, charges and settlement), e2e `kx10-kiorex-tab.spec.ts`

## Follow-ups

- Platform admin UI for `PlatformIntegrationClient` issuance
- Webhook delivery for marketplace client (reuse outbox)
- Auto-sync listing on verification / subscription / scheduling changes
- KX-05 outbox consumer to push profiles to Kiorex
- KX-04…KX-07 additional marketplace routes