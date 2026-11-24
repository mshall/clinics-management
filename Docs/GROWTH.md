# Growth and Marketing (GRW-P1-D1 provider links, D2 commission decisions, L staff app)

Status: As-built on branch `kiorex`, 24 Nov 2026. Every default marked PROPOSED_DEFAULT is a founder decision pending. Nothing deployed or pushed.

## Promise
Bookings through a provider's own links, QR codes or widget never carry a Kiorex fee. Evidence can remove a fee, never add one.

## D1 provider links
- Code: `apps/api/src/growth/provider-links/`. Module `ProviderLinksModule` (separate from `GrowthModule` to avoid a Billing/Marketplace import cycle).
- Link: 8 Crockford characters (no I L O U), scopes ORG, CLINIC, BRANCH, DOCTOR, DESK, channels per D0, optional UTM/campaign tags (`ProviderReferralLink.tags`, migration `20261128120000_growth_link_tags`), lifecycle ACTIVE, PAUSED, REVOKED (permanent).
- API (JWT): `GET /growth/access|links|summary|performance|recommendations|profile-preview|widget`, `POST /growth/links` (flag `growth.provider_links`), `PATCH /growth/links/:id`, `GET /growth/links/:id/qr.svg|qr.png|poster|vcard`, `PUT /growth/widget`.
- Public: `GET /public/booking-pages/:slug?s=<code>` counts one non-bot visit (no cookie, no IP stored) and returns a signed `lt`; every doctor `widgetUrl` is never null (dedicated `KIOREX_BOOKING_WIDGET_URL` if set, else the Kiorex canonical URL `/{locale}/{cc}/{doctor|clinic}/{slug}` from `KIOREX_PATIENT_WEB_URL`). `GET /public/links/q/:code` (302 or JSON) and `GET /public/links/go/:slug` (302 to Kiorex with `lt` and UTM). Redirects only to configured hosts. Web route `/q/:code`.
- `lt`: `base64url({o: tenant, c: code, t, v:1}).HMAC` with `LINK_TOUCH_SIGNING_SECRET` or `KIOREX_OUTBOX_WEBHOOK_SECRET`; 72 h; re-checked against the ACTIVE link at booking.
- Config: `BOOKING_LINK_BASE_URL` (kiorly.link later, NH-008), `KIOREX_PATIENT_WEB_URL`, `KIOREX_BOOKING_WIDGET_URL`, `KIOREX_WIDGET_BASE_URL` (proposed `https://book.kiorex.com`).
- QR: local `qrcode` library, level M, 4-module quiet zone; payload is the short link only. Printable HTML sheets (poster A4/A5, desk card, 10 doctor cards, AR/EN RTL); PDF = browser "Save as PDF" (no server PDF engine). vCard for doctor links.
- Widget (`BookingWidgetConfig`, `settings` column, migration `20261128120100`): origins validated by the contract rule (https, exact, no wildcard, max 10); audit `growth.widget.updated`; `PROVIDER_PROFILE_UPDATED.widgetOrigins` (empty while disabled).
- Roles (PROPOSED_DEFAULT): owner/admin all; marketing = `CLINIC_ASSISTANT` (no Marketing role exists yet) create/pause, no revoke, no widget origins; `GROUP_SUPERVISOR`, `RECEPTIONIST` view. Plan limits (`growth-plan-limits.ts`): active links LITE 3, PRO 25, CLINIC 100, ENTERPRISE 500; widget from PRO.
- Web: `/kiorex/growth` (sidebar "Growth & Marketing", link from the Kiorex tab, Quick setup step `growth_links`). Strings in `features/growth/growth-strings.ts` (merged like the Kiorex tab, shared locale files only got `nav.growth` and the two Quick setup labels).

## D2 commission intake and decisions
- `POST /marketplace/v1/bookings` accepts the signed `acquisition` block (contracts 1.10.0): malformed gives 400 `ACQUISITION_BLOCK_INVALID` / `ACQUISITION_EVIDENCE_HASH_INVALID`; stored and frozen as `Appointment.acquisitionOrigin|DecisionRef|PolicyVersion`; absent = UNATTRIBUTED. A valid `lt` or the CLINIC_LINK channel makes the booking PROVIDER_LED. `lt` is a Clinic-side body field not in the contract yet (KC change needed).
- `commission-decision.ts`: pure gate, `CP1@<effective date of the newest rate in force>` policy version, append-only idempotent writer (`ON CONFLICT DO NOTHING`). `CommissionChargeService.onCheckIn` writes one decision for both outcomes and then runs the unchanged charge code; events carry `decisionRef`, `origin`, `policyVersion`.
- Market handling `featureDefaults.kiorex.commissionHandling {cancelledNoShow: REVERSE|KEEP, refunded: CREDIT|NONE}` (defaults = old behaviour).
- Dispute reason `PROVIDER_LED_EVIDENCE`: auto-approved from evidence (`GROWTH_EVIDENCE_MODE=mock` default reads the Clinic's own link facts; `real` calls Kiorex `GET /growth/v1/evidence/{bookingId}`, unverified against a live Kiorex). `GROWTH_EVIDENCE_DISPUTES=off` leaves them OPEN for a human. Approval appends decision `<policy>+PLE`, flips origin to PROVIDER_LED, emits `CommissionAdjusted` plus the usual reversal.
- Read: `GET /kiorex/commission-decisions?appointmentId=`, `GET /kiorex/commission-statement?period=YYYY-MM` (reconciliation verdict). Override: `POST /platform/kiorex/commission-decisions/override` (platform admin, reasons GOODWILL_WAIVER or POLICY_CORRECTION, note required, removal only, audited, decision `+OVR<n>`).
- Clinic OpenAPI copy `apps/api/openapi/marketplace.openapi.json` is 1.4.0; qa04 test extended.
- Booking concurrency: serialization conflict (P2034) now answers `SLOT_TAKEN` 409 with alternatives (or the existing booking for the same key).

## Honest gaps
Staff app Growth tab (later package). Server PDF. `lt` not in the contract. Real evidence fetch untested. The Marketing role is approximated. Widget host and kiorly.link are NEEDS_HUMAN. Kiorex-side verification of `lt` and the canonical page routes belong to packages B/C/E. The doctor-link Playwright case skips when the seeded clinic has no listed doctor.

## L staff app Growth tab (GRW-P1-L)
- API `apps/api/src/mobile/growth-mobile.{controller,service}.ts` (module `ProviderLinksModule`), all under the `/mobile/*` plan gate (`mobile_staff_app`, 403 `FEATURE_DISABLED`). `GET /mobile/growth` returns the whole tab in one call (level, plan limits, profile URL, links with last-30-day counts, 30-day performance, up to 5 recommendations, month fee statement summary for admins, `webGrowthUrl`); `GET /mobile/growth/links`; `GET /mobile/growth/qr?linkId=` (SVG, profile QR when omitted); `POST /mobile/growth/links` (flag `growth.provider_links`, plan link limit); `PATCH /mobile/growth/links/:id` (pause or resume only, revoke is web-only).
- Module key `clinic.growth`: GROUP_ADMIN, CLINIC_ADMIN, BRANCH_MANAGER, tenant owner (admin), GROUP_SUPERVISOR (read), CLINIC_ASSISTANT (marketing: create, pause), PHYSICIAN (doctor level: only their own DOCTOR links and profile, no performance, no fee statement, no create). Front desk, call centre, finance, HR and the nurse role get 403 `MODULE_NOT_ALLOWED`. The doctor level is PROPOSED_DEFAULT with the rest of the D1 matrix.
- No patient data is returned anywhere: counts, link codes, money. The fee statement block carries the period, totals, decision counts and the reconciliation verdict only.
- Tests: `mobile/growth-mobile.node.test.ts`; end to end `e2e/test/27-growth-provider-journeys.e2e.ts`; app `kiorly/e2e-web/clinic-growth.spec.ts`.

