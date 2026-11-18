# Kiorly launch build log

**Canonical step tracker:** [`Docs/kiorly-cursor-build-sequence.md`](./kiorly-cursor-build-sequence.md) (§5 checklist + §6 specs). There is no `KIORLY_CURSOR_BUILD_SEQUENCE.md`; log and resume work only against the lowercase file above.

## Autonomous agent rules (resume from here)

**LOOP** (repeat until every step in §5 of `Docs/kiorly-cursor-build-sequence.md` is ticked)

0. **Before starting each step:** `git fetch origin` and merge the latest `origin/main` into `kiorly/launch`; resolve conflicts, run §0.2, push. If the step is already fully implemented on `main`, verify every acceptance criterion with tests, add any missing tests, tick it as **verified on main**, and continue.
1. In §5, find the first unchecked step. Read only its section in §6. Read §2–§4 only when the step refers to them.
2. Create branch `kiorly/<STEP-ID>-<slug>` from the latest `kiorly/launch`.
3. Implement following §0.1 (schema → API → web en+ar → tests → docs). Run every command in §0.2; up to 3 fix rounds.
4. Merge step branch into `kiorly/launch` (merge commit `[<STEP-ID>] <title>`), run §0.2 on launch, push, delete step branch.
5. Tick §5 with merge hash; append one line below; at end of each stage, stage summary + tag `kiorly-stage-<letter>`.

**NEVER** until FINAL PHASE: commit/merge/push `main`, merge draft PR, run deploy scripts, edit workflows/infra unless step requires, skip/reorder steps, break §0.5 hard rules.

**FINAL PHASE** only when all §5 ticked: green PR checks → `gh pr merge` → watch `deploy-aws.yml` → tag `kiorly-launch-v1`.

---

## Setup

| When (UTC) | Event |
|------------|--------|
| 2026-11-18 | Pipeline on `main` @ `4d62eb0` green. `kiorly/launch`, draft PR #75, tracker [`Docs/kiorly-cursor-build-sequence.md`](./kiorly-cursor-build-sequence.md) only. |

## Follow-ups (deferred steps)

| Step | Notes |
|------|--------|
| CR-07 | Threshold nudges today: `KiorexProgressNudge` + `AuditLog` only. **WhatsApp/in-app owner copy + monthly recap** → implement in **MS-04** (owner digests) on Step 077. |
| CR-11 | Statement delivery rows (`billing.monthly_statement_ready`, INTERNAL) are enqueued on issue; the **email/WhatsApp sender** for INTERNAL `billing.*` topics is not built yet (pair with MS-04). Web lint has 3 pre-existing errors (`clinical-letter-dialog.tsx`, `invoice-document-preview.tsx`, `collect-visit-balance-card.tsx`). |
| SB-05/06 | Local full `test:e2e`: 13 pre-existing UI spec failures unrelated to billing (encounter dialog strict-mode, HR clinic picker, theme ids, patient-manage, signup-ar, flows-integrity). Billing specs (`sb03`, `sb05`, `sb06`, `qa01`) green. CI `187a6f7` golden e2e hit `BILLING_SEAT_INACTIVE` on seeded physician (data-order flake; `pl01` integration test mutates first tenant's subscription) — watch next runs. |
| SC-02 | NH-001 (PDPC licence filing) remains in `Docs/KIORLY_NEEDS_HUMAN.md`; product gates are in code/tests. |

## Steps

| Step | Merge on `kiorly/launch` | Notes |
|------|--------------------------|-------|
| 001 FD-00 | `955b94b` | Verified on main |
| 002 FD-01 | `dd42945` | Verified on main |
| 003 FD-02 | `2f98396` | Full ETA/fiscal removal; `postRevenue` only; NH-002 closed; `Docs/FD-02_ETA_RETIRED.md` |
| 004 SC-01 | `316c557` | `legalConfig` gates, sub-processor guard, platform legal UI; `Docs/SC-01_FRANKFURT_RESIDENCY.md` |
| 005 CL-01 | — | Verified on main · `Docs/EGYPT_DRUG_DATABASE.md` |
| 006 FS-01 | — | Verified on main · `fs01-scheduling.*.test.ts` |
| 007 PL-01 | — | Verified on main · `pl01-plan-catalog.*.test.ts` |
| 008 PL-02 | — | Verified on main · `pl02-subscription.*.test.ts` |
| 009 PL-03 | — | Verified on main · `pl03-entitlements.*.test.ts` |
| 010 PL-04 | — | Verified on main · `pl04-*.test.ts` |
| 011 QA-06 | — | Verified on main · `qa06-sales-demo.*.test.ts` |
| 012 CR-05 | — | Verified on main · `Docs/CREDIT_WALLET.md` |
| 013 ON-01 | — | Verified on main · `Docs/PUBLIC_SIGNUP.md` |
| 014 ON-02 | — | Verified on main · `Docs/AUTH_SESSIONS.md` |
| 015 PL-06 | — | Verified on main · `pl06-nav-preset.node.test.ts` |
| 016 ON-04 | — | Verified on main · `on04-onboarding.*.test.ts` |
| 017 PL-05 | `12e3ea8` | Usage meters + WhatsApp quota; `Docs/USAGE_METERING.md` |
| 018 MS-01 | — | Verified on main · `Docs/MESSAGING_WHATSAPP.md` |
| 019 MS-02 | — | Verified on main · `ms02-whatsapp-replies.*.test.ts` |
| 020 MS-03 | — | Verified on main · `Docs/MESSAGING_CONSENT.md` |
| 021 CL-02 | — | Verified on main · `Docs/CLINICAL_RX_SAFETY.md` |
| 022 AI-03 | — | Verified on main · `Docs/AI_HONEST_LABELS.md` |
| 023 SC-03 | — | Verified on main · `sc03-consent-policy.*.test.ts` |
| 024 GT-02 | — | Verified on main · `Docs/LEGAL_PACK.md` |
| 025 PL-09 | `12e3ea8` | `Cohort` model, founding assign on signup |
| 026 CR-01 | — | Verified on main · `Docs/TRIAL_ENGINE.md` |
| 027 CR-02 | — | Verified on main · `Docs/BOOKING_ATTRIBUTION.md` |
| 028 CR-04 | — | Verified on main · `Docs/KIOREX_FEES.md` |
| 029 SB-01 | — | Verified on main · `Docs/KIORLY_INVOICES.md` |
| 030 SB-02 | — | Verified on main · `Docs/KIORLY_PAYMENTS.md` |
| 031 CR-03 | — | Verified on main · `Docs/KIOREX_COMMISSION_CHARGES.md` |
| 032 CR-06 | — | Verified on main · `Docs/MONTHLY_SETTLEMENT.md` |
| 033 QA-03 | — | Verified on main · `qa03-settlement-matrix.node.test.ts` |
| 034 SB-03 | — | Verified on main · `Docs/DUNNING.md` |
| 035 PA-02 | — | Verified on main · `Docs/COMMERCIAL_CONFIG.md` |
| 036 SC-07 | — | Verified on main · `Docs/AUDIT_BILLING.md` |
| 037 ON-03 | — | Verified on main · `Docs/CLINICIAN_VERIFICATION.md` |
| 038 PA-03 | — | Verified on main · `pa03-verification-review.integration.test.ts` |
| 039 KX-01 | — | Verified on main · `Docs/KIOREX_MARKETPLACE.md` |
| 040 KX-02 | — | Verified on main · `kx02-provider-profile.integration.test.ts` |
| 041 KX-03 | — | Verified on main · `kx03-slot-*.test.ts` |
| 042 KX-04 | — | Verified on main · `kx04-marketplace-booking.integration.test.ts` |
| 043 KX-05 | — | Verified on main · `kx05-outbox.integration.test.ts` |
| 044 QA-01 | — | Verified on main · `apps/web/e2e/qa01-golden-flow.spec.ts` |
| 045 QA-02 | — | Verified on main · `Docs/QA_MONEY_PATH.md` |
| 046 QA-05 | — | Verified on main · `Docs/QA_OBSERVABILITY.md` |
| 047 AI-01 | — | Verified on main · `ai-gateway.service.ts` + `sc03-consent-policy.integration.test.ts` |
| 048 SC-02 | — | Verified on main · `Docs/SC02_PDPC_EGYPT.md` |
| 049 PL-07 | `f9dd2d5` | Proration APIs, billing seats, compare-plan preview UI |
| 050 CR-07 | `be3589b` | Progress API + ring UI; nudge delivery deferred to MS-04 (see Follow-ups) |
| 005–048 | — | 2026-11-18 backfill: §5 ticked **verified on main** (see `Docs/kiorly-cursor-build-sequence.md` §5) |
| 051 PL-08 | `e7d9d33` | Global 402 paywall modal, paywall audit events, owner-only SaaS pay |
| 052 CR-08 | `0bf6d1b` | CommissionDispute model, auto-resolve, platform ops queue, owner outbox |
| 053 CR-09 | `fcfbdad` | ReferralCode/Referral, `GET /growth/referral`, dual REFERRAL grants on first paid invoice |
| 054 CR-11 | `3049900` | `GET /billing/statements[/:period]` JSON + bilingual PDF, Plan & billing statements panel, statement outbox on issue; invoice TAX-line subtotal fix; NH-003 |
| 055 SB-05 | `1eb1a44` | Lite min invoice (pack, default 100) + idempotent carry (`kiorlySettlementCarryPeriodKey/In`), carried charges BILLED, `GET /billing/lite-fees` + Lite fees card, Lite unpaid D+30 → listing PAUSED/billing (Kiorly stays ACTIVE), holds/bookings need LIVE; web lint errors fixed; sb03 e2e uses bearer API |
| 056 SB-06 | `2c9dabb` | `PlanPriceMigration`: new version → move at first renewal after notice (pack `priceChangeNoticeDays`, default 30), never before `priceLockUntil`/`validFrom`; hourly notice (bilingual INTERNAL outbox) + apply (consent-by-continuing); `preview: true` impact (tenants, MRR delta); `GET …/plans/price-migrations` report + platform UI; NH-004 |
| 057 ON-05 | `8d23928` | `ImportJob` + AR/EN templates, xlsx/csv validate→preview→background commit (10k rows ≈1 s)→24h undo of untouched rows, dedupe skip/merge, error report CSV; imported patients `acquisitionChannel=IMPORT` never new for Kiorex; `/onboarding/import` wizard; `actingRepUserId` hook for ON-07 |
| 058 ON-06 | `209a27b` | `Invitation` + seat check (clinicians / assistant seats incl. pending invites → 402), INTERNAL outbox `staff.invitation` (bilingual) + copyable link, resend rotates token, revoke, public accept sets password + roles; `/team` + `/invite/:token`; GT-02 test isolated from demo tenant (golden e2e seat flake); NH-005 |
| 059 ON-07 | `0537b3f` | `SALES_REP` role + `SalesRep` code; `POST /rep/tenants` → tenant `PENDING_OWNER` (owner login blocked) until owner OTP + legal at `/confirm` → ACTIVE + INTERNAL `rep.owner_welcome` set-password link; `salesRepCode` on tenant + subscription; rep imports via ON-05 `actingRepUserId`; `/rep/portfolio` signups/activations/paid, `/rep/commission` on retained clinics (market `commercialConfig.salesRep`, default 10 %/90 d); mobile `/rep` console; NH-006 |
| 060 ON-08 | `94111f6` | `Patient.isSample` + `/onboarding/sample-data` (demo patient + fee-free appointment); never revenue (`postRevenue` 400, visit-fee auto-post skipped), never Kiorex commission, never WhatsApp/SMS (consent + scheduler + worker); excluded from reports, dashboard, onboarding auto-steps, trial activation; 5-step role tour (auto once on `/onboarding`), Help drawer (guide, Arabic videos via `VITE_HELP_VIDEO_BASE_URL`, sample patient); NH-007 |
| 061 KX-06 | `3a90c13` | Pack `kiorex.cancellationPolicy` (12 h cancel / 12 h reschedule / 24 h deposit refund / 2 reschedules) + `Clinic.kiorexCancellationPolicy` override; `POST /marketplace/v1/bookings/:ref/cancel|reschedule` enforced server-side (422 codes, rejections audited), deposit refund decided server-side; clinic cancel of Kiorex/clinic-link bookings needs a reason (400 otherwise) → always refundable, audited, reason in `CANCELLED_BY_CLINIC` outbox; `GET/PUT /kiorex/settings` + new **Kiorex** tab (policy card) |
| 062 KX-08 | `817bfad` | `KiorexReview` + `KiorexRating` (per clinic/doctor, weighted); `REVIEW_INVITATION_ELIGIBLE` outbox only on COMPLETED marketplace/WhatsApp/clinic-link visits; `POST /marketplace/v1/reviews/aggregate` rejects reviews without a completed visit (`NOT_A_COMPLETED_VISIT`), audited; clinic reply via `POST /kiorex/reviews/:id/reply` → `REVIEW_REPLY_POSTED` outbox; Kiorex tab ratings card + Reports rating tile; legacy `SatisfactionSurveyResponse` retired (kept) |
| 063 KX-09 | `b348360` | `Clinic.bookingSlug` + per-doctor `MarketplaceListing.bookingSlug` (one namespace, auto-assigned, editable, audited); `GET /public/booking-pages/:slug` (branding, LIVE doctors, bookable types, Kiorex widget URL) + web `/b/:slug`; Kiorex booking `channel: CLINIC_LINK` → `bookingSource CLINIC_LINK` (slug must match clinic/doctor), never commissioned (test with marketplace control); marketplace intake now stamps `isNewPatientAtBooking`; Kiorex tab "Your booking link" (copy, QR, share, A4/A5 AR/EN poster, Google guide); NH-008 |
| 064 KX-10 | `5daa7d8` | `PUT /kiorex/settings` extended (auto/manual confirm, per-doctor listed toggle + daily cap, per-type bookable/min notice/horizon/deposit; validated, audited, slot caches invalidated) on existing fields; `GET /kiorex/overview?clinicId=&period=` (views, bookings by channel, attended, no-shows, new patients, commission confirmed/pending, CR-07 free progress + offset, rating, daily series) reconciled with appointments, charges and settlement (test); `KiorexProfileViewDaily` + `POST /marketplace/v1/analytics/profile-views`; bilingual Kiorex tab with RTL chart |
