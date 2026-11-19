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
| 065 CL-03 | `f53e999` | `PrescriptionVerificationToken` (hashed, pack `clinicalConfig.rxVerification.tokenTtlDays`, default 14 d); `POST /encounters/:id/prescription/print` signed-only (409 `RX_NOT_SIGNED`) print model = brand + strength + CL-01 ingredients + Arabic sig (`sigToArabic`, never guesses unknown English); `GET /public/rx/verify/:token` = projection of the printed Rx with patient initials only (test: no MRN/phone/ID/DOB/notes/diagnoses) + `/pdf` bilingual PDF with vector QR; `POST …/prescription/send` → consent-checked WhatsApp `prescription_ready` with PDF document link, audited; draft prints drop the MRN QR; web Signed prescription card + `/rx/:token`; NH-009 |
| 066 CL-04 | `1c36163` | `ClinicalSpecialty.UROLOGY` + `ClinicalFormTemplate.systemTemplateVersion`; built-in templates v2 for 11 launch specialties (derm morphology/BSA/Fitzpatrick, peds growth + HC + milestones, OB `lmp_date` → computed EDD/GA + G/P/FHR, ortho side/special tests, ENT per-ear otoscopy, IM chronic review, cardio NYHA/LVEF, psych MSE + risk + PHQ-9/GAD-7, ophtho VA/IOP per eye, urology IPSS/PSA, dental FDI/caries) upgraded in place with stable field ids; `LAUNCH_TEMPLATE_REVIEWS` required-element check; signup appointment types per specialty with fee factors; picker grouped by specialty; NH-010 board sign-off |
| 067 CL-05 | `af7b7dd` | Shared `common/encounter-lock` computes the auto-lock on **every write** (previously only on read — a write after 72h without an open slipped through) → 409 `ENCOUNTER_LOCKED`; guards added to lab/radiology upload on signed notes, encounter delete, chart encounter-doc delete/crop, data-explorer encounter/diagnosis/medication edits. Source guard test fails on new unguarded writers. `EncounterAmendment` append-only trail (migration backfills legacy `amendReason`), re-sign stamps, `ENCOUNTER_AMENDED` audit; amend limited to signing clinician / group supervisor-admin. Web: signed-by + lock lines, amendment history, amend dialog (replaces `window.prompt`), Sign amended note; Finalize no longer offered on already-signed notes. Gate: typecheck/lint/unit/integration green; e2e 74 pass / 15 fail (same pre-existing set; `encounter-delete-rbac` fails at login 401 / list load, not the lock). |
| 068 FS-02 | `0e363a2` | Check-in friction: payment method + channel dropdowns → one-tap chips (market/org channels), transfer choice auto-focuses Transaction ID, ≥44px targets, decimal keypad → InstaPay check-in = 3 taps. Transaction ID checked client-side with the same `referencePattern` the API uses; errors shown inline on the field (aria-invalid, focus kept), nothing sent until valid. API transfer-reference 400s now carry `errorCode` (`TRANSFER_REFERENCE_REQUIRED/FORMAT/NOT_VERIFIED`), `field`, `messageKey errors.transfer.*` + `channel`. Desktop shortcuts: Ctrl/⌘+Enter, Alt+1…, board N/S. Timed E2E (tablet 800×1280, phone 390×844) ≤4 taps & <30 s, keyboard-only and inline-error specs. e2e helper `bookAppointmentViaApi` extracted. Gate green; e2e 78 pass / same 15 pre-existing failures. |
| 069 FS-03 | `43703f5` | Cancellations (front desk, integration, WhatsApp Cancel reply) record a `WaitlistOpenSlot` (unique per clinician + start). `WaitlistAutofillService` (15 s loop) offers it over WhatsApp to the oldest eligible waiting patient with Accept/Decline buttons, hold from market pack `messaging.waitlist.offerHoldMinutes` (default 15); decline/expiry → next; nobody → EXHAUSTED; booked by desk first → FILLED_ELSEWHERE. One live offer per slot enforced by unique `activeSlotId`; accept is an atomic PENDING→ACCEPTED claim → CONFIRMED appointment, outbox event, `WAITLIST_SLOT_BOOKED` audit. Front desk board Waitlist panel (add/remove, freed slots + offer status, EN/AR). Also: waitlist create now checks tenant ownership; freed-slot recording can no longer fail a committed cancel. NH-011 (Meta templates). Gate green; integration 181 pass; e2e 79 pass / same 15 pre-existing failures. |
| 070 FS-05 | `00b3005` | Shared `common/no-show-risk` (formula unchanged) adds band low/medium/high (<30/<60/≥60), factors (previous no-shows, deposit flag, starts < 4 h), constant `method: RULE_BASED` and a high-risk suggestion (deposit when the plan has `deposits` and the patient isn't flagged, else extra reminder). `AppointmentDto.noShowRisk` on upcoming SCHEDULED/CONFIRMED bookings for Pro+ (`mod_front_desk`). Nightly `NoShowRiskScheduler` 01:00 UTC persists `noShowRiskScore` (writes only changed rows; manual refresh now pages past the old 200-row cap). Web chip "High no-show risk · rule-based" on list rows, calendar cards and appointment page, tooltip / visible note "not a trained prediction model" + factors + suggestion (EN/AR plurals). Also removed an FS-03 fast-refresh lint warning (back to 77). Gate green; integration 184 pass; e2e 80 pass / same 15 pre-existing failures. |
| 071 MN-01 | `67832a2` | `BillingRefund`, `CashMovement`, `PatientDeposit`, `PatientPackageConsumption` (+ package clinic/status/method). Refund (against a payment or collected revenue row) = exactly one negative `REFUND` revenue row via `postRevenue` on the same visit (tax pro-rata) + one `OUT` cash movement + `CreditNote`; above pack `providerConfig.billing.refundApprovalThreshold` (default 1000) → `PENDING_APPROVAL`, approver ≠ requester, nothing posts until approved; advisory locks stop over-refund. Packages & deposits are liabilities: sale/deposit = cash `IN` only; each session = `PACKAGE_SESSION` revenue (last session takes rounding), applied deposit = `DEPOSIT_APPLIED`, forfeited = `DEPOSIT_FORFEIT`, cancel/release = cash `OUT` only; expiry blocks use. `GET /patients/:id/balances`; patient "Packages & refunds" tab + refund dialog (EN/AR). Cash close counts non-payment movements. Gate green (`ci:test`: unit 427, integration 190); MN-01 e2e pass. |
| 072 KX-07 | `0dc47e1` | `KIOREX_PAY` payment method (market pack, no desk chip) + `TenantPaymentChannel`; `POST /marketplace/v1/bookings/:ref/deposit-paid` (idempotent on Kiorex `paymentRef`, ≤ fee, market currency) records a held `PatientDeposit` on the booking — no revenue, no drawer. `DepositSettlementService` (inside front-desk check-in + 60 s reconciler, per-appointment advisory lock): check-in/complete → `BillingPayment` + allocation whose revenue is the `DEPOSIT_APPLIED` row from `postRevenue` (`BillingPaymentAllocation.revenueEntryId`); cancel → release, or forfeit when KX-06 says non-refundable; no-show → forfeit. Refund of the converted payment or its allocation shares one balance and reverses revenue without a drawer `OUT`. Visit-fee receivable offset by applied deposits; cash close skips converted deposits. `POST /marketplace/v1/payouts` + `GET /billing/kiorex-payouts` (collected − refunded = due; − payouts = outstanding). Web: deposit badge on appointment list/detail, Kiorex tab payouts card (EN/AR). Desk deposits always `CLINIC` source. Gate green (unit 430, integration 196); KX-07/MN-01/KX-10 e2e pass. |
| 073 FS-04 | `250a0e4` | Deposit rules in `billing/deposit-policy` (patient flag, no-shows ≥ N, risk score ≥ X, appointment-type deposit; amount = type deposit else % of fee, capped at fee) from market pack `commercialConfig.deposits` + `Clinic.depositPolicy` override (`GET/PUT /clinics/:id/deposit-policy`, approvers, audited). `POST /appointments/:id/deposit-link` (Pro+ `deposits`) → `PENDING` deposit with sha256-hashed token (no money/revenue), WhatsApp `deposit_payment_link`, new link voids the old. Clinic links → public `/pay/:token` (no patient name, clinic transfer channels) + desk `POST /billing/deposits/:id/mark-paid` (reference unless cash); Kiorex Pay links → `KIOREX_PAY_LINK_BASE_URL` + `POST /marketplace/v1/deposit-links/:token/paid` (idempotent, amount must match). 5-min expiry job → `EXPIRED`, optional auto-cancel (`cancelledBy=SYSTEM`, outbox, slot freed). Unpaid links voided when the visit ends; `PATCH /appointments/:id/status` now settles deposits in-transaction; WhatsApp Cancel stamps `cancelledBy=PATIENT` and `depositRefundable` from `depositRefundMinHours` → late cancel forfeits (`DEPOSIT_FORFEIT`), early cancel refunds. Desk methods exclude `KIOREX_PAY`; payouts report ignores unpaid links. Web: deposit panel (required reasons, send link, copy, mark paid) + chip statuses (EN/AR). NH-012. Gate green (unit 435, integration 203); FS-04/KX-07/FS-02/FS-05 e2e pass. |
| 074 MN-02 | `5a23222` | `CommissionRule` + clinic / visit type / revenue category / payer / priority / label and `ROOM_RENTAL`; new `DoctorStatement` (`DRAFT` → `APPROVED` lock → `PAID`, adjustments + payouts JSON). Engine (`revenue-share/revenue-share-engine.ts`): collected `POSTED` revenue only (month in market timezone, rejected transfers excluded, refunds negative), doctor via encounter/appointment/operation, most specific rule wins (doctor 8 · type 4 · category 2 · payer 2 · branch 1, then priority, newest); percent / fixed per paid visit / room rental (doctor keeps unmatched collections minus rental); unmatched → clinic. `mod_revenue` API `/revenue-share/*` (statements, reconciliation, adjustments, approve, mark-paid, bilingual PDF, rules) — doctors see own only; all changes audited; never touches revenue. Web: statements card on Revenue (owner: approve, adjust, pay, rules) and Doctor revenue (own). Gate green (unit 442, integration 209); MN-02 e2e pass. |
