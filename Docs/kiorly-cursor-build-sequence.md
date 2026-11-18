# Kiorly — Cursor Build Sequence

> Generated from the **Kiorly Launch Readiness Build Guide** (updated 18 Nov 2026: ETA out of scope, data stays in Frankfurt).
> Repo: `mshall/clinics-management` · baseline commit `09b99ae` · **108 steps** in dependency order.
> Each step = one branch, one PR. Do not reorder; every step only depends on earlier steps.

---

## 0. Instructions for Cursor (read this section first, every session)

You are executing a build plan step by step. Follow this protocol exactly.

### 0.1 Execution protocol

1. Open **§5 Progress tracker** and find the **first unchecked step**. That is the only step you work on.
2. Read that step's section in **§6** completely (use the step number to find it: `### Step NNN`). Do not read ahead or start the next step.
3. Confirm every step listed in **Depends on** is checked in §5. If not, stop and report which dependency is missing.
4. Check the step **Type**:
   - **Code** → implement it fully.
   - **Code + human input** → implement the code; list the human items under "Needs human" in your summary.
   - **Human task / Ops task** → do only the preparation described, then stop and ask the human to complete it.
5. Before changing code, inspect the files named under **Current state** and follow the repo rules in **§1** (also saved as `.cursor/rules/kiorly.mdc`).
6. Implement in this order: Prisma schema + named migration → API (module, DTOs, guards, services) → web UI (with **both** `en.json` and `ar.json` strings) → tests → docs.
7. Write a test for **every acceptance criterion** of the step. Then run the checks in §0.2. All must pass.
8. Update the relevant `Docs/*.md` status rows (see §1 rule 10).
9. In §5, change the step's `- [ ]` to `- [x]` and add the PR/commit reference after it.
10. Finish with a short summary: what changed, migrations added, tests added, anything deferred ("Follow-ups"), and anything that needs a human ("Needs human").

### 0.2 Commands to run before marking a step done

```bash
npm run db:ensure            # local Postgres up + migrated
npm run db:migrate -w api    # only when the step changes schema.prisma (creates a named migration)
npm run typecheck            # api + web
npm run lint                 # web
npm run test:unit            # api *.node.test.ts
npm run test:integration     # api *.integration.test.ts
npm run test:e2e             # Playwright (required for steps that change UI flows)
```

### 0.3 Stop and ask the human when

- A dependency step is not checked.
- The step type is Human or Ops.
- A migration would drop or rewrite existing production data in a way not described in the step.
- The step's instructions conflict with code that has changed since commit `09b99ae` (describe the conflict and propose an adaptation).
- You need secrets, provider accounts, legal text, or a business value marked "confirm" or "placeholder".

### 0.4 Git conventions

- Branch: `kiorly/<STEP-ID>-<short-slug>` (e.g. `kiorly/PL-01-plan-catalog`).
- Commits: `feat(<module>): [<STEP-ID>] <summary>` · `fix(...)`, `test(...)`, `docs(...)` as appropriate.
- One PR per step. PR title: `[<STEP-ID>] <step title>`. PR body: the acceptance criteria as a checklist, all ticked.

### 0.5 Hard rules that override anything else

- **No ETA.** Kiorly never submits e-receipts or e-invoices to ETA. Never add fiscal submission code. Clinics issue their own.
- **Frankfurt only.** Personal data stays in `eu-central-1`; only providers on the market's approved sub-processor list may receive it.
- **One revenue path.** Patient payments post revenue only through `postRevenue` (renamed in step 003).
- **Never hard-code Egypt.** Market-specific values come from the `Market` pack.
- **Clinical records are never locked.** No billing state may block viewing, printing or exporting patient records.

---

## 1. Repo rules (save as `.cursor/rules/kiorly.mdc`)

```markdown
# Kiorly repo rules (mshall/clinics-management)

You are working in a TypeScript monorepo:
- apps/api: NestJS 10 + Prisma (PostgreSQL). Modules live in apps/api/src/<module>. Keep module boundaries (see apps/api/src/platform/module-boundaries.node.test.ts and Docs/MODULAR_MONOLITH.md).
- apps/web: React + Vite + Tailwind + i18next. Features in apps/web/src/features/<feature>. Every user-facing string goes into BOTH apps/web/src/locales/en.json and ar.json (Arabic is first-class, RTL).
- apps/docs: documentation portal. Docs/*.md are the product docs.

Conventions:
1. Schema changes: edit apps/api/prisma/schema.prisma and create a named Prisma migration. Never rely on column defaults for market-specific business values; read them from the Market pack (Market.taxConfig, providerConfig, clinicalConfig, commercialConfig).
2. Multi-market: never hard-code Egypt. Use market-resolver and market packs. Currency and VAT come from the market.
3. Feature gating: FeatureFlagsService resolves platform → market → plan → org. Paid features use @RequiresEntitlement and return HTTP 402 { code: "PLAN_UPGRADE_REQUIRED", entitlement, requiredPlan }.
4. Money: every patient payment posts revenue through the single function postRevenue (formerly postRevenueWithFiscal). Never create/patch RevenueEntry elsewhere (revenue-single-path.node.test.ts enforces this). Kiorly does NOT integrate with ETA: never add fiscal submissions, e-receipts or e-invoice calls; clinics issue their own. Kiorly's own SaaS billing uses KiorlyInvoice models, never the patient Invoice models.
5. RBAC: use the effectiveRoles/hasRole helper (users can hold several roles). Respect nav tab grants and money visibility overrides.
6. Audit: every state change affecting money, access, plans or credits writes an AuditLog entry.
7. Events to external systems go through the OutboxEvent table (transactional outbox), never direct HTTP inside a request.
8. Tests: unit/integration tests as *.node.test.ts next to the code (node:test); E2E in apps/web/e2e (Playwright). Add tests for every acceptance criterion.
9. Security: production data stays in Frankfurt (eu-central-1) under the recorded transfer approval; only providers on the market's approved sub-processor list may receive personal data. No PHI in logs or AI prompts without a passing consent check; secrets in Secrets Manager refs, never in code.
10. Docs: update the relevant Docs/*.md status row in the same change.

Output: small, reviewable commits; explain any schema change and migration; list follow-ups you did not do.
```

---

## 2. Commercial parameters (defaults — all must be configurable per market)

| Config key | Default | Meaning |
|---|---|---|
| `trial.foundingDays` | 180 | Your 6-month plan, for the founding cohort, with the activation rule. |
| `trial.standardDays` | 90 | After the cohort fills, or when founding activation fails. |
| `trial.activation` | ≥ 20 visits checked-in within 30 days | Unlocks the full founding trial. |
| `trial.commissionPolicy` | WAIVE_UP_TO_PLAN_PRICE | During trial, pay only commission above the plan price. Alternatives: WAIVE_ALL, CHARGE. |
| `cohort.FOUNDING_EG.cap` | 500 | First 500 paying clinics. |
| `cohort.priceLockMonths` | 24 | Founding price lock. |
| `price.PRO` | EGP 999 annual-monthly / 1,299 monthly per doctor | Validate 799 / 999 / 1,299 in the pilot. |
| `price.CLINIC` | EGP 3,499 / month incl. 5 doctors, +699 each | Annual discount configurable. |
| `kiorex.fee` | EGP 40 flat per attended new patient (placeholder) | Set from unit economics; benchmark warning at > 50% of the lowest competitor. |
| `kiorex.newPatientLookbackMonths` | 24 | No visit at this tenant in the window. |
| `kiorex.disputeWindowDays` | 7 | After this, charges are final. |
| `kiorex.autoConfirmHours` | 24 | PENDING → CONFIRMED after check-in if not completed earlier. |
| `lite.minInvoice` | EGP 100 | Smaller amounts carry forward. |
| `lite.commissionMonthlyCap` | none | Optional cap for Lite doctors. |
| `dunning.graceDays / readOnlyAfterDays / suspendAfterDays` | 14 / 15 / 45 | Records always viewable and exportable. |
| `referral.rewardMonths / expiryMonths` | 1 / 12 | Both sides, after the referee's first paid period. |
| `taxConfig.saasVatPercent` | 14 (confirm) | VAT shown on Kiorly's invoices to clinics. |
| `market.EG.dataRegion` | eu-central-1 (Frankfurt) | Set explicitly in the EG pack; requires a recorded transfer approval (SC-01). |

Values marked "placeholder" or "confirm" are business decisions: seed them as config, never as code constants.

---

## 3. Tier entitlement matrix (source for the plan seed in step 010)

| Capability | Lite | Pro | Clinic | Enterprise |
|---|---|---|---|---|
| Clinicians (seats) | 1 | Per seat | 5 incl. (+699) | Unlimited |
| Branches | 1 | 1 | 3 | Unlimited |
| Assistant / receptionist seats | 1 | 1 per doctor | Unlimited | Unlimited |
| Appointments, patients, encounters, Rx | ✓ | ✓ | ✓ | ✓ |
| Scheduling: series, waitlist, deposits | Basic | ✓ | ✓ | ✓ |
| Payments export for the clinic's own ETA / accounting | — | ✓ | ✓ | ✓ |
| Service catalog, packages, credit notes | — | ✓ | ✓ | ✓ |
| WhatsApp messages / month | 100 | 1,000 / doctor | 1,000 / doctor | Custom |
| Reports + exports | Basic | ✓ | ✓ | ✓ |
| Doctor revenue share & statements | — | Single doctor | ✓ | ✓ |
| Cash drawer & shift close | — | Basic | ✓ | ✓ |
| Payers, pre-auth, TPA claims | — | — | ✓ | ✓ |
| Operations & installments | — | — | ✓ | ✓ |
| HR & attendance | — | — | Basic | ✓ + payroll |
| Expenses, org hierarchy, Data Explorer | — | — | — | ✓ |
| Role assistant (AI) | — | Quota | Quota | Custom |
| AI scribe | — | Add-on | Add-on | Add-on |
| Integration clients / API | — | — | — | ✓ |
| Kiorex listing | Fee per attended new patient | Commission credited vs subscription | Commission credited vs subscription | Negotiated |
| Clinic booking link (commission-free) | ✓ | ✓ | ✓ | ✓ |

Prices (EG, placeholders to validate): Lite free · Pro EGP 999 per doctor/month billed annually, 1,299 monthly · Clinic EGP 3,499/month incl. 5 doctors, +699 per extra doctor · Enterprise custom.

---

## 4. Trial & Kiorex credit engine reference (used by steps 026–032, 033)

### 4.1 Core rule: pay the higher of subscription or commission, never both

```text
S = plan price + seats + add-ons (prorated, excl. VAT)       # 0 for Lite
C = Σ CONFIRMED Kiorex charges in the period − disputes
offset  = min(S, C)          → line KIOREX_COMMISSION_OFFSET (negative, informational)
net     = max(S, C) − prepaid S (annual) − wallet credits used
due     = net + VAT (Market.taxConfig.saasVatPercent)
"Kiorly free this month"  ⇔  C ≥ S
```

### 4.2 What is a chargeable Kiorex patient

- `bookingSource` is `KIOREX_MARKETPLACE` or `KIOREX_WHATSAPP`. `CLINIC_LINK`, phone, walk-in, front desk, integration and import are **never** chargeable.
- New to the tenant: no attended appointment or signed encounter in the last 24 months (config), matched on normalised phone **or** national ID. Decision stored on the appointment at booking time.
- Charge: `PENDING` at check-in → `CONFIRMED` at completion/sign-off or 24 h after check-in → `BILLED` at settlement.
- Never charged: no-show, cancellation, check-in revert (→ `REVERSED`). Reschedules move the appointment, not the charge.
- Disputable for 7 days. Late reversal after billing → credit next period.

### 4.3 Worked examples — must be automated tests (Pro EGP 999/month, fee EGP 40)

| # | Situation | S | C | Clinic pays (excl. VAT) |
|---|---|---|---|---|
| 1 | Pro, 5 Kiorex patients | 999 | 200 | 999 |
| 2 | Pro, 30 Kiorex patients | 999 | 1,200 | 1,200 (Kiorly free) |
| 3 | Clinic plan (5 doctors), 60 patients | 3,499 | 2,400 | 3,499 |
| 4 | Pro in trial, 30 patients, policy WAIVE_UP_TO_PLAN_PRICE | 999 waived | 1,200 | 201 |
| 5 | Pro in trial, 10 patients | 999 waived | 400 | 0 |
| 6 | Lite, 12 patients | 0 | 480 | 480 (carry forward if < 100) |
| 7 | Pro, 10 patients, 999 referral credit in wallet | 999 | 400 | 0 (wallet → 0) |
| 8 | Pro annual (month prepaid), 30 patients | 999 prepaid | 1,200 | 201 |
| 9 | Lite → Pro upgrade on day 16 of 30 | 499.50 | 280 | 499.50 |

### 4.4 Settlement pseudocode

```text
settlePeriod(tenantId, periodKey):
  lock (tenantId, periodKey)                     # advisory lock; job is re-runnable
  if KiorlyInvoice exists for period and status != DRAFT: return it
  sub   = subscription snapshot at period end (+ change log for proration)
  S     = prorated(plan price × seats) + addons + usage overage      # 0 for Lite
  S_pre = portion of S already prepaid (annual)                       # else 0
  C     = sum(charges where status=CONFIRMED and attendedAt in period) # BILLED next
  if sub.status == TRIALING:
       S_eff = 0 ; C_eff = policy(WAIVE_ALL → 0 | WAIVE_UP_TO_PLAN_PRICE → max(0, C − S_list) | CHARGE → C)
  else S_eff = S ; C_eff = C
  gross  = max(S_eff, C_eff)
  offset = min(S_eff, C_eff)                     # line KIOREX_COMMISSION_OFFSET (negative), informational
  net    = gross − S_pre
  credits = wallet.consume(min(net, wallet.available), FIFO by expiry)   # ledger CONSUME entries
  payable = net − credits
  if plan == LITE and payable < liteMinInvoice: carry forward (no invoice), keep charges CONFIRMED
  tax     = round(payable × market.taxConfig.saasVatPercent)
  create KiorlyInvoice(lines…, total = payable + tax); mark charges BILLED; emit INVOICE_ISSUED
```

### 4.5 State machines

```text
Subscription:  TRIALING → ACTIVE | LITE (downgrade after 7-day grace, no payment method)
               ACTIVE → PAST_DUE (D+1) → GRACE (to D+14, full access) → READ_ONLY (D+15) → SUSPENDED (D+45) → CANCELLED
               any → ACTIVE on payment.  READ_ONLY/SUSPENDED: records always viewable, printable, exportable.
Charge:        PENDING → CONFIRMED → BILLED;  PENDING/CONFIRMED → REVERSED;  CONFIRMED → DISPUTED → REVERSED|CONFIRMED;
               BILLED → REVERSED (credit next period);  trial policy → WAIVED
```

---

## 5. Progress tracker

Cursor: tick a step only after its acceptance tests pass. Add the PR or commit after the title.


**Stage A · Foundations** — Before anything commercial

- [x] Step 001 · FD-00 · Remove UAE defaults; derive tax & fees from the market pack — verified pre-shipped on main; docs `Docs/FD-00_MARKET_TAX_DEFAULTS.md`
- [x] Step 002 · FD-01 · Owner-physician: allow one user to hold several roles — see `Docs/RBAC_MULTI_ROLE.md`
- [x] Step 003 · FD-02 · Take ETA receipts and e-invoicing out of Kiorly — `2f98396` · `Docs/FD-02_ETA_RETIRED.md` (full product removal)
- [x] Step 004 · SC-01 · Frankfurt data residency: transfer approval & controls in the product — `Docs/SC-01_FRANKFURT_RESIDENCY.md` (60-day alert + public sub-processor page in follow-up)
- [x] Step 005 · CL-01 · Egyptian drug database (brand → active ingredient) — verified on main · `Docs/EGYPT_DRUG_DATABASE.md` · `drug-catalog.*.test.ts`
- [x] Step 006 · FS-01 · Scheduling engine completeness (buffers, rooms, overrides, channels) — verified on main · `fs01-scheduling.*.test.ts` · `Docs/PATIENT_360_AND_SCHEDULING.md`
- [x] Step 007 · PL-01 · Plan catalog with per-market, versioned prices — verified on main · `pl01-plan-catalog.*.test.ts` · `Docs/PLANS_AND_PRICING.md`
- [x] Step 008 · PL-02 · Subscription model & lifecycle state machine — verified on main · `pl02-subscription.*.test.ts`
- [x] Step 009 · PL-03 · Entitlement service, guards and plan layer in feature flags — verified on main · `pl03-entitlements.*.test.ts` · `Docs/FEATURE_FLAGS.md`
- [x] Step 010 · PL-04 · Map every existing module to an entitlement — verified on main · `pl04-*.test.ts` · `Docs/PLANS_AND_ENTITLEMENTS.md`
- [x] Step 011 · QA-06 · Staging with WhatsApp sandbox, payment sandboxes & seeded pilot tenants — verified on main · `qa06-sales-demo.*.test.ts` · `Docs/QA_STAGING.md`

**Stage B · Self-serve & Lite** — A doctor can sign up and work alone

- [x] Step 012 · CR-05 · Credit wallet & immutable ledger — verified on main · `cr05-credit-wallet.*.test.ts` · `Docs/CREDIT_WALLET.md`
- [x] Step 013 · ON-01 · Public self-serve signup (phone OTP) that provisions a ready clinic — verified on main · `on01-signup.*.test.ts` · `Docs/PUBLIC_SIGNUP.md`
- [x] Step 014 · ON-02 · Password reset, OTP login & session management — verified on main · `on02-auth.*.test.ts` · `Docs/AUTH_SESSIONS.md`
- [x] Step 015 · PL-06 · Lite simplified mode (nav presets per plan) — verified on main · `pl06-nav-preset.node.test.ts` · `apps/web/e2e/pl06-nav-sidebar.spec.ts`
- [x] Step 016 · ON-04 · Onboarding wizard & activation checklist — verified on main · `on04-onboarding.*.test.ts`
- [x] Step 017 · PL-05 · Usage metering & quotas (WhatsApp, AI minutes) — `12e3ea8` · `Docs/USAGE_METERING.md`
- [x] Step 018 · MS-01 · Real WhatsApp Business provider with approved templates — verified on main · `ms01-whatsapp.*.test.ts` · `Docs/MESSAGING_WHATSAPP.md`
- [x] Step 019 · MS-02 · Inbound replies: confirm, cancel, reschedule — verified on main · `ms02-whatsapp-replies.*.test.ts`
- [x] Step 020 · MS-03 · Messaging consent, opt-out & PDPL handling — verified on main · `ms03-messaging-consent.*.test.ts` · `Docs/MESSAGING_CONSENT.md`
- [x] Step 021 · CL-02 · Rx safety checks by ingredient (interactions, allergies, duplicates) — verified on main · `cl02-rx-safety.*.test.ts` · `Docs/CLINICAL_RX_SAFETY.md`
- [x] Step 022 · AI-03 · Honest AI labels across the product — verified on main · `ai-feature-disclosure.node.test.ts` · `Docs/AI_HONEST_LABELS.md`
- [x] Step 023 · SC-03 · Consent enforcement in code (AI, marketplace, messaging) — verified on main · `sc03-consent-policy.*.test.ts` · `Docs/PATIENT_CONSENT.md`
- [x] Step 024 · GT-02 · Legal pack: terms, subscription & fee terms, DPA, privacy notice — verified on main · `gt02-legal.*.test.ts` · `Docs/LEGAL_PACK.md`

**Stage C · Money engine** — Trial, credits, invoices, collections

- [x] Step 025 · PL-09 · Founding cohort & 24-month price lock — `12e3ea8`
- [x] Step 026 · CR-01 · Trial engine (6-month founding trial, standard trial, activation rule) — verified on main · `cr01-trial.*.test.ts` · `Docs/TRIAL_ENGINE.md`
- [x] Step 027 · CR-02 · Booking attribution & the "new patient" rule — verified on main · `cr02-*.test.ts` · `Docs/BOOKING_ATTRIBUTION.md`
- [x] Step 028 · CR-04 · Kiorex fee configuration with competitor benchmark guardrail — verified on main · `cr04-kiorex-commission.node.test.ts` · `Docs/KIOREX_FEES.md`
- [x] Step 029 · SB-01 · Kiorly invoices (separate from clinic patient invoices) — verified on main · `sb01-kiorly-invoice.*.test.ts` · `Docs/KIORLY_INVOICES.md`
- [x] Step 030 · SB-02 · Payment collection: cards, Fawry, InstaPay, bank transfer — verified on main · `sb02-kiorly-payments.*.test.ts` · `Docs/KIORLY_PAYMENTS.md`
- [x] Step 031 · CR-03 · Kiorex commission charge capture & lifecycle — verified on main · `cr03-commission-charge.*.test.ts` · `Docs/KIOREX_COMMISSION_CHARGES.md`
- [x] Step 032 · CR-06 · Monthly settlement engine ("pay the higher of, never both") — verified on main · `cr06-settlement.*.test.ts` · `Docs/MONTHLY_SETTLEMENT.md`
- [x] Step 033 · QA-03 · Settlement & credit engine test matrix — verified on main · `qa03-settlement-matrix.node.test.ts`
- [x] Step 034 · SB-03 · Dunning & access policy that never blocks clinical records — verified on main · `sb03-dunning.*.test.ts` · `apps/web/e2e/sb03-read-only.spec.ts` · `Docs/DUNNING.md`
- [x] Step 035 · PA-02 · Commercial configuration UI (plans, trials, fees, dunning) — verified on main · `pa02-commercial-config.*.test.ts` · `Docs/COMMERCIAL_CONFIG.md`
- [x] Step 036 · SC-07 · Audit coverage for billing, credits and plan changes — verified on main · `sc07-*.test.ts` · `Docs/AUDIT_BILLING.md`

**Stage D · Kiorex connector** — Marketplace-ready supply

- [x] Step 037 · ON-03 · Doctor verification (Syndicate number, licence) for marketplace listing — verified on main · `on03-verification.integration.test.ts` · `Docs/CLINICIAN_VERIFICATION.md`
- [x] Step 038 · PA-03 · Verification review queue — verified on main · `pa03-verification-review.integration.test.ts`
- [x] Step 039 · KX-01 · Platform-level Kiorex connector & per-doctor marketplace listing — verified on main · `kx01-*.test.ts` · `Docs/KIOREX_MARKETPLACE.md`
- [x] Step 040 · KX-02 · Provider profile publishing — verified on main · `kx02-provider-profile.integration.test.ts`
- [x] Step 041 · KX-03 · Canonical slot engine shared by Kiorly UI and Kiorex — verified on main · `kx03-slot-*.test.ts`
- [x] Step 042 · KX-04 · Booking intake: slot holds, idempotency, patient matching — verified on main · `kx04-marketplace-booking.integration.test.ts`
- [x] Step 043 · KX-05 · Transactional outbox & full status event set — verified on main · `kx05-outbox.integration.test.ts` · `outbox-*.node.test.ts`
- [x] Step 044 · QA-01 · Golden-flow end-to-end tests (Playwright) — verified on main · `apps/web/e2e/qa01-golden-flow.spec.ts` · `Docs/QA_GOLDEN_FLOW.md`
- [x] Step 045 · QA-02 · Money-path API tests — verified on main · `qa02-*.test.ts` · `Docs/QA_MONEY_PATH.md`
- [x] Step 046 · QA-05 · Observability & alerting for money and booking paths — verified on main · `qa05-operational-alerts.node.test.ts` · `Docs/QA_OBSERVABILITY.md`
- [x] Step 047 · AI-01 · Compliant AI hosting & consent-checked AI gateway — verified on main · `sc03-consent-policy.integration.test.ts` · `apps/api/src/providers/ai/ai-gateway.service.ts`
- [x] Step 048 · SC-02 · PDPC licences, DPO, privacy notice (business tasks) — verified on main · `sc02-pdpc-egypt.*.test.ts` · `Docs/SC02_PDPC_EGYPT.md` (NH-001 filings remain human-owned)

**Stage E · Launch completeness** — Everything for public launch

- [x] Step 049 · PL-07 · Upgrade, downgrade, seat changes & proration
- [x] Step 050 · CR-07 · "Kiorly is free" progress meter & nudges
- [x] Step 051 · PL-08 · Plan & billing page, paywall moments and upgrade prompts
- [x] Step 052 · CR-08 · Commission disputes & adjustments
- [x] Step 053 · CR-09 · Doctor-to-doctor referral credits
- [x] Step 054 · CR-11 · Monthly statement for clinics (PDF + in-app)
- [x] Step 055 · SB-05 · Lite commission invoicing & minimum invoice — `1eb1a44` · `sb05-lite-invoicing.*.test.ts` · `Docs/MONTHLY_SETTLEMENT.md`
- [x] Step 056 · SB-06 · Currency, price indexation & grandfathering — `2c9dabb` · `sb06-price-indexation.*.test.ts` · `Docs/PLANS_AND_PRICING.md`
- [x] Step 057 · ON-05 · Data import from Excel / CSV (patients, appointments, price list, staff) — `8d23928` · `on05-import.*.test.ts` · `e2e/on05-import.spec.ts` · `Docs/ONBOARDING.md`
- [x] Step 058 · ON-06 · Staff invitations by WhatsApp or email — `209a27b` · `on06-invitations.integration.test.ts` · `e2e/on06-invitations.spec.ts` · `Docs/ONBOARDING.md`
- [x] Step 059 · ON-07 · Field-sales assisted onboarding & rep attribution — `0537b3f` · `on07-sales-reps.integration.test.ts` · `e2e/on07-rep-console.spec.ts` · `Docs/ONBOARDING.md`
- [x] Step 060 · ON-08 · First-run tour, sample data & in-app help — `94111f6` · `on08-sample-data.integration.test.ts` · `e2e/on08-help-sample.spec.ts` · `Docs/ONBOARDING.md`
- [x] Step 061 · KX-06 · Reschedule & cancellation policies (both directions)
- [ ] Step 062 · KX-08 · Verified reviews after completed visits
- [ ] Step 063 · KX-09 · Clinic-branded booking page & link (commission-free)
- [ ] Step 064 · KX-10 · Kiorex tab inside Kiorly (settings + performance)
- [ ] Step 065 · CL-03 · Prescription print & WhatsApp share with verification QR
- [ ] Step 066 · CL-04 · Specialty template coverage for launch specialties
- [ ] Step 067 · CL-05 · Doctor sign-off, amendments & auto-lock
- [ ] Step 068 · FS-02 · Golden-flow front desk review on tablet & phone
- [ ] Step 069 · FS-03 · Waitlist auto-fill on cancellations
- [ ] Step 070 · FS-05 · Show no-show risk in the UI with an honest label
- [ ] Step 071 · MN-01 · Refunds, credit notes, deposits & prepaid packages (APIs + UI)
- [ ] Step 072 · KX-07 · Kiorex deposits & prepayments into clinic billing
- [ ] Step 073 · FS-04 · Deposits & payment links for high-risk bookings
- [ ] Step 074 · MN-02 · Doctor revenue-share engine & statements
- [ ] Step 075 · MN-03 · Cash drawer & shift close UI hardening
- [ ] Step 076 · MN-06 · Split payments & installments UX
- [ ] Step 077 · MS-04 · Doctor and owner digests
- [ ] Step 078 · MS-05 · Transactional email (trial, invoices, security)
- [ ] Step 079 · AI-02 · AI scribe with Egyptian Arabic speech-to-text
- [ ] Step 080 · AI-04 · Gate the role assistant and clinic AI by plan
- [ ] Step 081 · RP-01 · Operational KPIs: no-show rate, utilisation, revenue per doctor-hour, sources
- [ ] Step 082 · RP-02 · Excel/PDF exports & scheduled reports
- [ ] Step 083 · RP-03 · Kiorex impact report
- [ ] Step 084 · SC-04 · MFA policy for owners, admins and finance in every environment
- [ ] Step 085 · SC-05 · Tenant data export & offboarding
- [ ] Step 086 · SC-06 · Rate limiting, WAF, secrets hygiene & penetration test
- [ ] Step 087 · SC-08 · Backup restore drill
- [ ] Step 088 · QA-04 · Kiorex contract tests
- [ ] Step 089 · QA-07 · Load & device performance tests
- [ ] Step 090 · UX-01 · Installable PWA with push and offline "today" view
- [ ] Step 091 · UX-02 · Mobile-first doctor views
- [ ] Step 092 · UX-03 · Arabic RTL & Egyptian copy QA
- [ ] Step 093 · PA-01 · Tenant lifecycle console
- [ ] Step 094 · PA-04 · Support access with consent & audit
- [ ] Step 095 · PA-05 · Growth analytics: activation funnel & cohorts
- [ ] Step 096 · GT-01 · Marketing website & pricing page with "Kiorly free" calculator
- [ ] Step 097 · GT-03 · Help centre & Arabic video tutorials
- [ ] Step 098 · GT-04 · Support operations & WhatsApp support line
- [ ] Step 099 · GT-05 · Sales kit: demo tenants, ROI calculator, referral & rep codes
- [ ] Step 100 · GT-06 · Docs cleanup & capability map update

**Stage F · Phase 1b** — After public launch

- [ ] Step 101 · CR-10 · No-show guarantee credits (optional, off by default)
- [ ] Step 102 · KX-11 · Consent-based record sharing with the patient app
- [ ] Step 103 · CL-06 · Lab & radiology orders as records
- [ ] Step 104 · CL-07 · Specialty packs: dental chart, aesthetics before/after, physio plans
- [ ] Step 105 · MN-05 · Company contracts & TPA claims
- [ ] Step 106 · MS-06 · WhatsApp AI receptionist (Egyptian Arabic)
- [ ] Step 107 · RP-04 · AR aging, payouts and branch P&L
- [ ] Step 108 · UX-04 · Thermal printing & accessibility

---

## 6. Build sequence

---

## Stage A · Foundations

> Before anything commercial. Steps 001–011.

### Step 001 · FD-00 · Remove UAE defaults; derive tax & fees from the market pack

| | |
|---|---|
| **Workstream** | Foundations & fixes |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FD-00-remove-uae-defaults-derive-tax-fees-from` |

**Goal.** Egyptian tenants are created with UAE-style values (5% VAT, EGP 150 visit fee, TRN "N/A"). Wrong VAT on printed invoices is a problem from day one, even though clinics issue their own ETA documents.

**Current state (inspect first).** schema.prisma: Tenant.defaultInvoiceVatPercent @default(5), Clinic.invoiceVatPercent @default(5), Tenant.defaultVisitFee @default(150), defaultTaxRegistrationNumber @default("N/A"), deploymentCell @default("frankfurt"), Market.dataRegion @default("eu-central-1"). Market.taxConfig already exists.

**Build**
- Remove business defaults from the schema columns (keep them nullable or neutral) and set them in market-provision.service when a tenant or clinic is created, from Market.taxConfig / clinicalConfig.
- Add taxConfig keys: invoiceVatPercent (medical services), saasVatPercent (Kiorly's own invoices), defaultVisitFee, trnFormat (regex), trnRequired.
- Validate the TRN format per market on org and clinic settings (optional field, printed on invoices when present).
- Data migration: recompute existing EG tenants and clinics from the pack; log every change in AuditLog.
- Add a market-pack-validation rule that fails if a live market has no tax config.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
// schema.prisma (excerpt)
model Tenant {
  defaultInvoiceVatPercent     Decimal? @db.Decimal(5, 2)   // was @default(5)
  defaultVisitFee              Decimal? @db.Decimal(14, 2)  // was @default(150)
  defaultTaxRegistrationNumber String?                      // was "N/A"
  deploymentCell               String                       // set from Market.hostCell, no default
}
// Market.taxConfig JSON
{ "invoiceVatPercent": 0, "saasVatPercent": 14, "defaultVisitFee": 300,
  "trnFormat": "^[0-9]{9}$", "trnRequired": false }
```

**API**
- No new endpoints; provisioning paths: POST /admin/platform/markets/:id/provision, tenant and clinic create.

**UI**
- Org settings and clinic settings show the market-derived value with an "override" toggle.

**Acceptance criteria** (write a test for each)
- [ ] A new EG tenant gets the VAT %, visit fee and cell from the EG pack, never from a column default.
- [ ] Existing EG tenants are corrected by migration, with audit rows.
- [ ] An invalid TRN shows a clear Arabic and English validation error.
- [ ] Node tests cover provisioning for EG and a dummy second market.

**Notes / needs human:** Confirm with an Egyptian tax adviser the VAT treatment of medical services (often exempt) and of Kiorly's SaaS invoices (standard rate, 14% in Egypt).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 001 is ticked in §5.

### Step 002 · FD-01 · Owner-physician: allow one user to hold several roles

| | |
|---|---|
| **Workstream** | Foundations & fixes |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All (critical for Lite) |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FD-01-owner-physician-allow-one-user-to-hold-s` |

**Goal.** User.role is a single enum. A solo doctor on Lite must be tenant owner (settings, billing) and physician (encounters, Rx) at once. Small clinics also have doctor-owners.

**Current state (inspect first).** User.role UserRole (single). RBAC via role + nav tab grants (user-nav-tabs, tenant-role-nav-tabs) and privilege grants.

**Build**
- Add User.additionalRoles UserRole[] (default []) and User.isTenantOwner Boolean.
- Create a central helper hasRole(user, role) and effectiveRoles(user); replace direct user.role === checks across api/src (guards, assistant-access, nav-tab policies).
- JWT payload carries roles[]; web auth store exposes roles and isOwner.
- Nav tabs = union of the role presets (deduplicated).
- Exactly one owner per tenant; ownership transfer endpoint with MFA re-check.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model User {
  role             UserRole
  additionalRoles  UserRole[] @default([])
  isTenantOwner    Boolean    @default(false)
}
```

**API**
- PATCH /admin/users/:id/roles { additionalRoles }
- POST /admin/tenant/transfer-ownership { toUserId, mfaCode }

**UI**
- User editor: primary role + extra roles chips (seat-limited by plan).
- Profile shows "Owner" badge.

**Acceptance criteria** (write a test for each)
- [ ] A Lite signup user can create an encounter and open Plan & billing without switching accounts.
- [ ] Every RBAC check uses the helper (grep for "user.role ===" returns none outside the helper).
- [ ] The privileged MFA guard applies when any held role is privileged.
- [ ] E2E test: owner-physician golden flow.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 002 is ticked in §5.

### Step 003 · FD-02 · Take ETA receipts and e-invoicing out of Kiorly

| | |
|---|---|
| **Workstream** | Foundations & fixes |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FD-02-take-eta-receipts-and-e-invoicing-out-of` |

**Goal.** Legal confirmed that doctors, clinics and enterprises issue their own ETA e-receipts and e-invoices with their own registered systems. Kiorly submits nothing to ETA. Leaving the code active risks Kiorly submitting documents on a clinic's behalf, adds ETA steps to onboarding, and keeps secrets and a public callback endpoint you no longer need.

**Current state (inspect first).** compliance module (eta-egypt client and serializer, eta-receipt-queue, fiscal-submission.worker, fiscal-submit.service, post-revenue-with-fiscal, void-revenue-fiscal-returns), fiscal-devices module (virtual device auto-provisioned on clinic create, credentials panel), eta_receipts feature flag, Organization ETA integration card and Kiorly ETA opt-out, public callback POST /integrations/fiscal/eta-egypt/notifications/{tenantId}, Governance FISCAL category, Docs/ETA_RECEIPT_V12.md and Docs/markets/egypt.md §1.

**Build**
- Turn eta_receipts off globally and for the EG market; set FISCAL_SUBMIT_WORKER=false and remove the worker from the deployment.
- Replace postRevenueWithFiscal with postRevenue: the same single money path for check-in, visit fee, billing and operation payments, without any fiscal queueing. Keep the CI single-path guard (rename fiscal-revenue-coverage.node.test.ts to revenue-single-path.node.test.ts).
- Voids and refunds reverse revenue through the existing void flow, without queueing return receipts.
- Stop auto-provisioning a virtual FiscalDevice on clinic creation; remove the device part of the add-clinic tax step.
- Hide and remove UI: Receipt devices panel, Clinic → Settings → ETA, Organization ETA integration card, Kiorly ETA opt-out, ETA queue page, "finish receipt device setup" banners, ETA status on invoices; remove the related en/ar keys.
- Remove the public ETA notification route and its API key; delete ETA provider credentials from Secrets Manager.
- Data: keep existing FiscalDocument, FiscalSubmission and FiscalDevice rows read-only (no drops yet); plan a later migration to archive and drop them after legal sign-off.
- Code: unregister the ETA modules now; delete them in a follow-up PR once the pilot runs clean. Remove their tests from the default CI run.
- Printouts (invoices, payment slips) are labelled as clinic payment records, not tax e-receipts. Confirm the exact Arabic and English wording with legal.
- Docs: archive ETA_RECEIPT_V12.md; update markets/egypt.md, CLINIC_PLATFORM_CAPABILITIES.md, FEATURE_FLAGS.md and COMPLIANCE_CONTROLS.md.

**API**
- Removed: /compliance/egypt/eta-queue*, fiscal submit and resubmit endpoints, /clinics/:id/fiscal-devices*, /integrations/fiscal/eta-egypt/notifications*
- Unchanged: all payment, billing and revenue endpoints

**UI**
- No ETA settings, banners, queues or statuses anywhere in the app.
- Payments export for the clinic's accountant or own ETA system is handled by RP-02.

**Acceptance criteria** (write a test for each)
- [ ] No environment makes any network call to ETA hosts (outbound host check in config + test).
- [ ] Creating a clinic creates no FiscalDevice.
- [ ] Check-in, billing and operation payments post revenue exactly as before; the renamed single-path test passes.
- [ ] No ETA strings remain in en.json or ar.json.
- [ ] Tenants with historic fiscal records can still open their past invoices without errors.

**Notes / needs human:** Kiorly as a company still has its own tax obligations for the invoices it sends to clinics. Handle those in your company accounting system, outside the product.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 003 is ticked in §5.

### Step 004 · SC-01 · Frankfurt data residency: transfer approval & controls in the product

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/SC-01-frankfurt-data-residency-transfer-approv` |

**Goal.** Decision made: production stays in Frankfurt (eu-central-1), because there is no cloud region in Egypt. Kiorly needs the Egyptian government approval for this cross-border transfer before processing patient data, and the product must record it and stay within it.

**Current state (inspect first).** Frankfurt RDS/S3 via CDK; cell model (Tenant.deploymentCell, Market.dataRegion/hostCell); Docs/markets/egypt.md describes PDPC licences; assistant uses the OpenAI EU endpoint.

**Build**
- Legal track: obtain the approval for keeping Egyptian data in Frankfurt. The repo's egypt.md names this as the PDPC controller/processor licences plus a cross-border transfer licence; have legal confirm the consent you are getting is (or covers) that.
- List every sub-processor in the application: AWS Frankfurt, the AI provider (EU endpoint), WhatsApp provider, email provider, payment gateways, error tracking.
- Record the approval in the EG market pack: Market.legalConfig.crossBorderTransfer { approvalRef, issuedAt, expiresAt, scope, subProcessors[] }. Alert platform admins 60 days before expiry.
- Set dataRegion = eu-central-1 and hostCell = frankfurt explicitly in the EG pack, not as column defaults.
- Config guard: a provider (AI, messaging, payments, email) that is not on the approved sub-processor list cannot be enabled for the market.
- Public sub-processor page; the patient privacy notice and clinic DPA state that data is hosted in Germany (EU) under the approval.
- Keep the cell model intact so an in-region cell stays possible later. No new cell work now.

**Data model** (adapt names to existing conventions; create a named migration)
```jsonc
// Market.legalConfig (EG)
{ "crossBorderTransfer": {
    "approvalRef": "PDPC-…", "issuedAt": "2027-…", "expiresAt": "2028-…",
    "destination": "DE (eu-central-1)",
    "subProcessors": ["aws-eu-central-1", "openai-eu", "whatsapp-bsp", "ses-eu", "paymob"] } }
```

**API**
- Platform: GET/PUT /admin/platform/markets/:id/legal-config

**UI**
- Market launch screen shows approval status, reference and expiry, and the approved sub-processor list.

**Acceptance criteria** (write a test for each)
- [ ] market-pack-validation refuses to set EG LIVE without an approval reference (or an explicit pilot exception approved by legal).
- [ ] Enabling a provider outside the approved list is rejected with a clear error.
- [ ] An infra test confirms EG tenant data, uploads and backups are in eu-central-1.

**Notes / needs human:** Before go-live, get legal's written confirmation that the approval covers the PDPC licence requirements and names your sub-processors. A narrower consent would leave AI, WhatsApp or payment providers uncovered.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 004 is ticked in §5.

### Step 005 · CL-01 · Egyptian drug database (brand → active ingredient)

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/CL-01-egyptian-drug-database-brand-active-ingr` |

**Goal.** Egyptian doctors prescribe by brand. Without a brand → ingredient map, interaction warnings miss real interactions while looking reassuring.

**Current state (inspect first).** EncounterMedication.drugName free text; DrugInteractionRule drugA/drugB by name.

**Build**
- Models: ActiveIngredient, DrugProduct (brand, form, strength, pack, manufacturer, registration no., marketId, isActive), DrugProductIngredient (strength per ingredient).
- EncounterMedication.drugProductId (nullable) + keep drugName as the printed text; free-text fallback flagged "unverified".
- Import pipeline from a licensed source (a commercial Egyptian drug database or official registry data you have the right to use), versioned DrugDatasetVersion.
- Search: AR/EN, prefix + fuzzy (pg_trgm), most-used by the doctor first.
- Dosage form, common sigs and Arabic instruction phrases for printing.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model ActiveIngredient { id String @id @default(cuid())  nameEn String  nameAr String?  atcCode String?  @@unique([nameEn]) }
model DrugProduct {
  id            String   @id @default(cuid())
  marketId      String
  brandNameEn   String
  brandNameAr   String?
  form          String
  strength      String?
  pack          String?
  manufacturer  String?
  registrationNo String?
  isActive      Boolean  @default(true)
  datasetVersion String
  ingredients   DrugProductIngredient[]
  @@index([marketId, brandNameEn])
}
model DrugProductIngredient { productId String  ingredientId String  strength String?  @@id([productId, ingredientId]) }
model EncounterMedication { drugProductId String? }
```

**API**
- GET /clinical/drugs/search?q=&limit=
- Platform: POST /admin/platform/drug-datasets (upload new version)

**UI**
- Rx entry autocomplete showing brand, form, strength and ingredients.

**Acceptance criteria** (write a test for each)
- [ ] "Augmentin" resolves to amoxicillin + clavulanic acid.
- [ ] Search p95 < 100 ms over the full dataset.

**Notes / needs human:** Licensing the dataset is a business task: confirm source, update frequency and permitted use.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 005 is ticked in §5.

### Step 006 · FS-01 · Scheduling engine completeness (buffers, rooms, overrides, channels)

| | |
|---|---|
| **Workstream** | Front desk & scheduling |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FS-01-scheduling-engine-completeness-buffers-r` |

**Goal.** Both the front desk and Kiorex depend on precise appointment types and rules.

**Current state (inspect first).** AppointmentType (duration, fee, colour), templates weekJson/blockedJson, Clinic.timezone, frontDeskRoomLabels.

**Build**
- AppointmentType: bufferBeforeMin, bufferAfterMin, requiresRoom, marketplaceBookable, minNoticeMinutes, maxDaysAhead, depositAmount, newPatientOnly flag.
- Per-clinician overrides (duration, fee) via ClinicianAppointmentTypeOverride.
- Typed weekJson schema (zod) with validation and migration of existing rows.
- Use clinic timezone everywhere; store UTC.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model AppointmentType {
  bufferBeforeMin     Int      @default(0)
  bufferAfterMin      Int      @default(0)
  requiresRoom        Boolean  @default(false)
  marketplaceBookable Boolean  @default(false)
  minNoticeMinutes    Int      @default(120)
  maxDaysAhead        Int      @default(30)
  depositAmount       Decimal? @db.Decimal(14, 2)
}
model ClinicianAppointmentTypeOverride {
  clinicianId     String
  typeId          String
  durationMinutes Int?
  feeAmount       Decimal? @db.Decimal(14, 2)
  @@id([clinicianId, typeId])
}
```

**API**
- PATCH /scheduling/appointment-types/:id
- PUT /scheduling/clinicians/:id/type-overrides

**UI**
- Appointment type editor with the new fields.

**Acceptance criteria** (write a test for each)
- [ ] Existing data migrates without changing current behaviour.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 006 is ticked in §5.

### Step 007 · PL-01 · Plan catalog with per-market, versioned prices

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 001 (FD-00) |
| **Branch** | `kiorly/PL-01-plan-catalog-with-per-market-versioned-p` |

**Goal.** Every commercial rule (trial, seats, credits, upgrade prompts) needs a source of truth for plans and prices per market, with versions so price changes don't touch existing customers.

**Current state (inspect first).** Nothing. Feature flags exist (platform/market/org) but there is no notion of plan.

**Build**
- Create Plan, PlanPrice and PlanEntitlement models; seed LITE, PRO, CLINIC, ENTERPRISE.
- Prices per market, currency, interval (MONTHLY/ANNUAL) and unit (PER_TENANT / PER_CLINICIAN); include includedClinicians and extraClinicianAmount for CLINIC.
- priceVersion plus validFrom/validTo; subscriptions keep the price row they signed up on (grandfathering).
- Optional cohortKey on a price (e.g. FOUNDING_EG_2027) for founding pricing.
- Public read endpoint for the pricing page and signup.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum PlanKey { LITE PRO CLINIC ENTERPRISE }
enum BillingInterval { MONTHLY ANNUAL }
enum PriceUnit { PER_TENANT PER_CLINICIAN }

model Plan {
  id        String  @id @default(cuid())
  key       PlanKey @unique
  nameEn    String
  nameAr    String
  isPublic  Boolean @default(true)
  sortOrder Int     @default(0)
  prices       PlanPrice[]
  entitlements PlanEntitlement[]
}
model PlanPrice {
  id                    String          @id @default(cuid())
  planId                String
  plan                  Plan            @relation(fields: [planId], references: [id])
  marketId              String
  currency              String
  interval              BillingInterval
  unit                  PriceUnit
  amount                Decimal         @db.Decimal(14, 2)
  includedClinicians    Int             @default(1)
  extraClinicianAmount  Decimal?        @db.Decimal(14, 2)
  cohortKey             String?
  priceVersion          Int             @default(1)
  validFrom             DateTime        @default(now())
  validTo               DateTime?
  @@index([planId, marketId, interval])
}
model PlanEntitlement {
  id        String @id @default(cuid())
  planId    String
  plan      Plan   @relation(fields: [planId], references: [id])
  key       String          // e.g. "eta_receipts", "max_clinicians"
  valueJson Json            // true | false | number | { ... }
  @@unique([planId, key])
}
```

**API**
- GET /public/plans?market=EG (no auth) → plans, active prices, headline entitlements
- Platform admin CRUD: /admin/platform/plans, /admin/platform/plans/:id/prices

**UI**
- Platform → Plans & pricing screen (see PA-02).

**Acceptance criteria** (write a test for each)
- [ ] Seed creates 4 plans and EG prices: Pro 999 annual-monthly / 1,299 monthly per clinician, Clinic 3,499 incl. 5 + 699 per extra.
- [ ] Creating a new price version never changes existing subscriptions.
- [ ] GET /public/plans returns AR and EN names and is cacheable.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 007 is ticked in §5.

### Step 008 · PL-02 · Subscription model & lifecycle state machine

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01) |
| **Branch** | `kiorly/PL-02-subscription-model-lifecycle-state-machi` |

**Goal.** Trials, payments, credits and access restrictions all hang off one subscription record per tenant.

**Current state (inspect first).** Nothing.

**Build**
- Subscription (one per tenant) with status, plan, price, interval, seats, trial dates, current period, founding lock, cancelAtPeriodEnd.
- SubscriptionEvent append-only log (created, trial_started, plan_changed, seats_changed, status_changed, cancelled).
- Daily SubscriptionLifecycleJob: trial ending notices, period roll-over, dunning transitions (see SB-03).
- Every tenant gets a subscription; existing tenants are migrated to ENTERPRISE (or a chosen plan) with ACTIVE status.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE GRACE READ_ONLY SUSPENDED CANCELLED }

model Subscription {
  id                     String             @id @default(cuid())
  tenantId               String             @unique
  planId                 String
  planPriceId            String?
  status                 SubscriptionStatus
  interval               BillingInterval    @default(MONTHLY)
  clinicianSeats         Int                @default(1)
  trialStartsAt          DateTime?
  trialEndsAt            DateTime?
  trialPlanId            String?            // plan experienced during trial (PRO)
  activatedAt            DateTime?          // activation rule met (CR-01)
  currentPeriodStart     DateTime
  currentPeriodEnd       DateTime
  prepaidUntil           DateTime?          // annual prepay coverage
  cohortKey              String?
  priceLockUntil         DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  defaultPaymentMethodId String?
  salesRepCode           String?
  referralCodeUsed       String?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
}
model SubscriptionEvent {
  id             String   @id @default(cuid())
  subscriptionId String
  type           String
  fromJson       Json?
  toJson         Json?
  actorUserId    String?
  createdAt      DateTime @default(now())
  @@index([subscriptionId, createdAt])
}
```

**API**
- GET /billing/subscription (owner, finance)
- POST /billing/subscription/change-plan { planKey, interval, seats } (preview + confirm)
- POST /billing/subscription/cancel { atPeriodEnd: true }

**UI**
- Admin → Plan & billing: current plan, status badge, trial countdown, seats, next invoice preview.

**Acceptance criteria** (write a test for each)
- [ ] Every tenant has exactly one subscription (DB constraint + backfill migration).
- [ ] Status transitions only through SubscriptionService (one method per transition), each writing a SubscriptionEvent and an AuditLog row.
- [ ] Lifecycle job is idempotent: running it twice a day changes nothing the second time.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 008 is ticked in §5.

### Step 009 · PL-03 · Entitlement service, guards and plan layer in feature flags

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02) |
| **Branch** | `kiorly/PL-03-entitlement-service-guards-and-plan-laye` |

**Goal.** Enforce what each tier can do in the API (not just hide UI), and give the web app one place to ask "can this tenant do X?".

**Current state (inspect first).** FeatureFlagsService resolves platform → market → org. No plan layer. Nav tabs are role-based only.

**Build**
- EntitlementsService.resolve(tenantId) = plan entitlements ⊕ add-ons ⊕ TenantEntitlementOverride (ops), cached per request.
- Insert a plan layer in FeatureFlagsService: global off → market off → plan not entitled → org override → … (plan-gated keys only).
- Decorator @RequiresEntitlement("eta_receipts") and a LimitGuard for numeric limits (max_clinicians, max_branches, max_assistant_seats).
- Uniform error: HTTP 402 { code: "PLAN_UPGRADE_REQUIRED", entitlement, requiredPlan }.
- Expose resolved entitlements in GET /auth/me; web useEntitlement(key) hook + <Gate> component.
- During TRIALING the trial plan's entitlements apply.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model TenantEntitlementOverride {
  id        String    @id @default(cuid())
  tenantId  String
  key       String
  valueJson Json
  reason    String
  expiresAt DateTime?
  createdBy String
  createdAt DateTime  @default(now())
  @@unique([tenantId, key])
}
```

**API**
- GET /auth/me → { …, plan: { key, status }, entitlements: { … } }
- Platform: PUT /admin/platform/tenants/:id/entitlement-overrides/:key

**UI**
- <Gate entitlement="deposits" fallback={<UpgradeHint/>}> wrapper used across features.

**Acceptance criteria** (write a test for each)
- [ ] Calling a gated endpoint on Lite returns 402 with requiredPlan; the web shows the upgrade modal (PL-08).
- [ ] Adding a 2nd clinician on Lite or a 6th on Clinic without extra seats is blocked by LimitGuard.
- [ ] Node tests: resolution order, overrides with expiry, trial behaviour.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 009 is ticked in §5.

### Step 010 · PL-04 · Map every existing module to an entitlement

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 009 (PL-03) |
| **Branch** | `kiorly/PL-04-map-every-existing-module-to-an-entitlem` |

**Goal.** The repo already has ~30 modules. Each one needs a plan rule so Lite isn't an enterprise product in disguise and Enterprise features stay paid.

**Current state (inspect first).** Modules: appointments, scheduling, front-desk, patients, encounters, clinical, invoices, billing, revenue, compliance, fiscal-devices (both ETA parts retired in FD-02), messaging, operations, expenses, hr, payroll, reports, dashboard, assistant, clinic-ai, integrations, admin (org hierarchy, data explorer), support.

**Build**
- Apply @RequiresEntitlement to controllers per the matrix in section 02.
- Seed PlanEntitlement rows from that matrix (single seed file: plans.seed.ts).
- Map existing feature flag keys (whatsapp_reminders, ai_assistant, card_payments) to plan entitlements; eta_receipts is retired (FD-02).
- Nav-tab presets per plan (see PL-06).

**API**
- None new.

**UI**
- None beyond gating.

**Acceptance criteria** (write a test for each)
- [ ] A table-driven test asserts every controller is either open to all plans or decorated with an entitlement.
- [ ] The matrix in Docs/PLANS_AND_ENTITLEMENTS.md matches the seed (generated from it).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 010 is ticked in §5.

### Step 011 · QA-06 · Staging with WhatsApp sandbox, payment sandboxes & seeded pilot tenants

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/QA-06-staging-with-whatsapp-sandbox-payment-sa` |

**Goal.** Realistic rehearsal before real clinics.

**Current state (inspect first).** Test data users doc, seed Dockerfile.

**Build**
- Staging env wired to WhatsApp test numbers and payment gateway sandboxes; seed script for Lite, Pro and Clinic demo tenants.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] One command resets a demo tenant for sales demos.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 011 is ticked in §5.

---

## Stage B · Self-serve & Lite

> A doctor can sign up and work alone. Steps 012–024.

### Step 012 · CR-05 · Credit wallet & immutable ledger

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02) |
| **Branch** | `kiorly/CR-05-credit-wallet-immutable-ledger` |

**Goal.** Credits come from several places: Kiorex offsets, referrals, promos, guarantees, goodwill and late dispute reversals. They need one auditable balance with expiry.

**Current state (inspect first).** Nothing (CreditNote exists but is for patient invoices, not Kiorly billing).

**Build**
- CreditWallet per tenant (currency fixed to the tenant's market).
- CreditLedgerEntry append-only: GRANT, CONSUME, EXPIRE, REVERSE with a reason and an optional expiry.
- Balance = Σ entries (materialised on the wallet with an optimistic version, recomputed nightly to verify).
- Consumption FIFO by earliest expiry; never below zero.
- Nightly expiry job writes EXPIRE entries.
- Every manual grant requires a reason and is audited; grants above a threshold need a 2nd approver (platform role).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum CreditEntryType { GRANT CONSUME EXPIRE REVERSE }
enum CreditReason { KIOREX_LATE_REVERSAL REFERRAL PROMO NO_SHOW_GUARANTEE GOODWILL DOWNGRADE_PRORATION ADJUSTMENT }
model CreditWallet {
  id        String   @id @default(cuid())
  tenantId  String   @unique
  currency  String
  balance   Decimal  @default(0) @db.Decimal(14, 2)
  version   Int      @default(0)
  entries   CreditLedgerEntry[]
}
model CreditLedgerEntry {
  id          String          @id @default(cuid())
  walletId    String
  wallet      CreditWallet    @relation(fields: [walletId], references: [id])
  type        CreditEntryType
  reason      CreditReason
  amount      Decimal         @db.Decimal(14, 2)  // positive for GRANT, negative otherwise
  remaining   Decimal?        @db.Decimal(14, 2)  // on GRANT rows, for FIFO
  expiresAt   DateTime?
  sourceRef   String?         // referralId, chargeId, invoiceId…
  invoiceId   String?
  note        String?
  createdBy   String?
  createdAt   DateTime        @default(now())
  @@index([walletId, createdAt])
}
```

**API**
- GET /billing/wallet → balance, upcoming expiries, entries (paged)
- Platform: POST /admin/platform/tenants/:id/credits { amount, reason, expiresAt, note }

**UI**
- Wallet card on Plan & billing; ledger table.

**Acceptance criteria** (write a test for each)
- [ ] Property test: random grant/consume/expire sequences never produce a negative balance, and balance = Σ entries.
- [ ] Concurrent consumption on the same wallet is serialised (version check or row lock).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 012 is ticked in §5.

### Step 013 · ON-01 · Public self-serve signup (phone OTP) that provisions a ready clinic

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 002 (FD-01), Step 008 (PL-02), Step 012 (CR-05) |
| **Branch** | `kiorly/ON-01-public-self-serve-signup-phone-otp-that` |

**Goal.** Lite as an acquisition engine only works if a doctor can sign up alone on a phone in a few minutes.

**Current state (inspect first).** Only POST /auth/login. Tenants and users are created by admins.

**Build**
- Steps: country (market) → mobile number → OTP (WhatsApp, SMS fallback) → name, email, password → specialty → clinic name, city/area, address pin → plan choice (Lite, or Pro trial).
- Provisioning transaction: Tenant (market), Clinic (from market pack), owner-physician User, Subscription (+ trial), CreditWallet, default AppointmentTypes for the specialty, ClinicianAvailabilityTemplate from clinic hours, MessageTemplates, nav preset.
- Capture salesRepCode and referral code from query params.
- Abuse controls: rate limit per IP and phone, OTP attempts, disposable email block, optional captcha.
- Emit SIGNUP_COMPLETED analytics event.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model OtpChallenge {
  id         String   @id @default(cuid())
  phone      String
  purpose    String           // SIGNUP LOGIN RESET
  codeHash   String
  attempts   Int      @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([phone, purpose])
}
```

**API**
- POST /public/signup/otp { phone, market }
- POST /public/signup/verify { phone, code } → signupToken
- POST /public/signup/complete { signupToken, profile, clinic, planKey, ref?, rep? } → session

**UI**
- Mobile-first, Arabic-first 5-screen flow with progress; lands on the onboarding checklist (ON-04).

**Acceptance criteria** (write a test for each)
- [ ] A new doctor goes from landing page to the dashboard in under 3 minutes on a mid-range Android.
- [ ] Provisioning is atomic (no half-created tenants on failure).
- [ ] Playwright test runs the full signup in AR.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 013 is ticked in §5.

### Step 014 · ON-02 · Password reset, OTP login & session management

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 013 (ON-01) |
| **Branch** | `kiorly/ON-02-password-reset-otp-login-session-managem` |

**Goal.** Without self-serve password reset, every forgotten password becomes a support ticket.

**Current state (inspect first).** Login + MFA (TOTP) only.

**Build**
- Forgot password via email link (signed, 30-min expiry) or WhatsApp OTP.
- Optional login with phone + OTP for doctors (MFA still enforced for privileged roles).
- Active sessions list and "sign out all devices"; refresh-token rotation if not already present.

**API**
- POST /auth/password/forgot, POST /auth/password/reset
- POST /auth/otp/request, POST /auth/otp/verify
- GET /auth/sessions, DELETE /auth/sessions/:id

**UI**
- Forgot-password link on login; sessions under Profile.

**Acceptance criteria** (write a test for each)
- [ ] Reset tokens are single-use and invalidated after a password change.
- [ ] Rate limits on all OTP endpoints.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 014 is ticked in §5.

### Step 015 · PL-06 · Lite simplified mode (nav presets per plan)

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | Lite, Pro |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 009 (PL-03), Step 002 (FD-01) |
| **Branch** | `kiorly/PL-06-lite-simplified-mode-nav-presets-per-pla` |

**Goal.** A solo doctor must not see HR, payroll, org hierarchy, Data Explorer or governance. Simplicity is the Lite selling point.

**Current state (inspect first).** Nav tab grants by role (TenantRoleNavTabGrant, UserNavTabGrant) and keys in nav-tab-keys.ts.

**Build**
- PlanNavPreset: allowed nav keys per plan; effective nav = role grants ∩ plan preset.
- Lite nav: Today, Appointments, Patients, Visits & Rx, Billing (basic), Kiorex, Settings, Help.
- Pro adds: Reports, Catalog & packages, Messaging, Waitlist. Clinic adds: Cash drawer, Revenue share, Payers & claims, Operations, HR basic. Enterprise: everything.
- Simplified settings page for Lite (one clinic, one doctor): profile, hours, appointment types, fees, WhatsApp, marketplace.
- Hide multi-branch selectors when the plan allows one branch.

**API**
- GET /auth/me returns nav already filtered.

**UI**
- Sidebar and mobile bottom nav driven by the effective nav list.

**Acceptance criteria** (write a test for each)
- [ ] Lite user sees ≤ 8 nav entries; direct URL to a hidden module returns the upgrade page, not a crash.
- [ ] Playwright: Lite, Pro and Clinic snapshots of the sidebar in AR and EN.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 015 is ticked in §5.

### Step 016 · ON-04 · Onboarding wizard & activation checklist

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 013 (ON-01) |
| **Branch** | `kiorly/ON-04-onboarding-wizard-activation-checklist` |

**Goal.** Activation (real bookings in the first 14 days) predicts conversion. The wizard gets clinics there.

**Current state (inspect first).** Planned in the capabilities doc; a guide feature exists.

**Build**
- Checklist: clinic profile and logo, working hours, appointment types and fees, doctor availability, invite receptionist, WhatsApp reminders on, import patients, first appointment, first check-in, Kiorex profile and verification.
- OnboardingProgress per tenant with step timestamps; resumable; skippable steps.
- Activation event when the CR-01 rule is met; celebrate in UI.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model OnboardingProgress {
  tenantId    String   @id
  stepsJson   Json     @default("{}")   // { "hours": "2027-04-02T…", … }
  completedAt DateTime?
  updatedAt   DateTime @updatedAt
}
```

**API**
- GET /onboarding, PATCH /onboarding/steps/:key

**UI**
- Checklist card on the dashboard until complete; each step deep-links to its screen.

**Acceptance criteria** (write a test for each)
- [ ] Median time to complete the required steps < 30 minutes in pilot sessions.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 016 is ticked in §5.

### Step 017 · PL-05 · Usage metering & quotas (WhatsApp, AI minutes)

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 009 (PL-03) |
| **Branch** | `kiorly/PL-05-usage-metering-quotas-whatsapp-ai-minute` |

**Goal.** WhatsApp and AI cost real money per unit. Quotas protect margin; meters feed overage billing and upgrade prompts.

**Current state (inspect first).** OutboundMessage rows exist; no counters.

**Build**
- UsageCounter per tenant, period (YYYY-MM) and metric, incremented atomically (upsert … increment).
- Metrics: WHATSAPP_MESSAGES, SMS_MESSAGES, AI_SCRIBE_MINUTES, AI_ASSISTANT_REQUESTS, ACTIVE_CLINICIANS (snapshot).
- Hook increments into outbound-message.worker, clinic-ai scribe and assistant.
- Soft warnings at 80% and 100%; at 100% WhatsApp reminders pause (front desk is notified) unless an overage pack is active.
- Add-on packs as purchasable entitlements (whatsapp_pack_500 etc.).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum UsageMetric { WHATSAPP_MESSAGES SMS_MESSAGES AI_SCRIBE_MINUTES AI_ASSISTANT_REQUESTS ACTIVE_CLINICIANS }
model UsageCounter {
  id        String      @id @default(cuid())
  tenantId  String
  periodKey String      // "2027-04"
  metric    UsageMetric
  quantity  Decimal     @default(0) @db.Decimal(14, 2)
  updatedAt DateTime    @updatedAt
  @@unique([tenantId, periodKey, metric])
}
```

**API**
- GET /billing/usage?period=2027-04

**UI**
- Plan & billing: usage bars with limits; banner at 80%.

**Acceptance criteria** (write a test for each)
- [ ] Counters never double count on worker retry (increment keyed by message or submission id).
- [ ] Quota block is visible to the receptionist, with a one-click "buy pack" for the owner.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 017 is ticked in §5.

### Step 018 · MS-01 · Real WhatsApp Business provider with approved templates

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 017 (PL-05) |
| **Branch** | `kiorly/MS-01-real-whatsapp-business-provider-with-app` |

**Goal.** Reminders are what clinic owners notice first; the current provider is a generic HTTP stub.

**Current state (inspect first).** whatsapp.provider.ts posts { to, body } to WHATSAPP_API_URL; MessageTemplate EN/AR; OutboundMessage queue + worker; reminder scheduler.

**Build**
- Provider interface with Meta WhatsApp Cloud API (or a BSP) implementation: template messages with variables and quick-reply buttons, media (PDF), per-market template names in Market.providerConfig.whatsapp.
- Store provider message id; delivery/read/failed status via webhook updates OutboundMessage.
- Business sender per platform (Kiorly) with clinic name in the template; option for clinic-own numbers later.
- Retry policy and failure classification surfaced in Governance.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model OutboundMessage {
  providerMessageId String?  @unique
  deliveredAt       DateTime?
  readAt            DateTime?
  templateName      String?
  variablesJson     Json?
}
```

**API**
- POST /webhooks/whatsapp (verify signature; GET for verification challenge)

**UI**
- Message log per patient and appointment with delivery ticks.

**Acceptance criteria** (write a test for each)
- [ ] Template messages deliver in staging to test numbers; statuses update within seconds.
- [ ] No free-form messages outside the 24h session window.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 018 is ticked in §5.

### Step 019 · MS-02 · Inbound replies: confirm, cancel, reschedule

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 018 (MS-01) |
| **Branch** | `kiorly/MS-02-inbound-replies-confirm-cancel-reschedul` |

**Goal.** Two-way confirmations are how no-shows actually drop.

**Current state (inspect first).** Planned.

**Build**
- Quick-reply buttons on reminders: Confirm / Cancel / Reschedule.
- Webhook maps replies to the appointment (message id context); updates status, emits outbox events, notifies front desk.
- Reschedule sends a link to pick a new slot (KX-09 page).

**API**
- Inside POST /webhooks/whatsapp

**UI**
- "Confirmed by WhatsApp" chip.

**Acceptance criteria** (write a test for each)
- [ ] A cancel reply frees the slot and triggers waitlist (FS-03).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 019 is ticked in §5.

### Step 020 · MS-03 · Messaging consent, opt-out & PDPL handling

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 018 (MS-01) |
| **Branch** | `kiorly/MS-03-messaging-consent-opt-out-pdpl-handling` |

**Goal.** Transactional reminders and marketing recalls have different consent rules.

**Current state (inspect first).** PatientDataProtectionConsent; recall campaigns foundation.

**Build**
- MessagingConsent per patient and channel and purpose (TRANSACTIONAL, MARKETING).
- STOP / "إلغاء" keyword handling; opt-out respected by all senders.
- Campaigns require MARKETING consent.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model MessagingConsent { id String @id @default(cuid())  tenantId String  patientId String  channel MessageChannel  purpose String  granted Boolean  source String  updatedAt DateTime @updatedAt  @@unique([patientId, channel, purpose]) }
```

**API**
- PUT /patients/:id/messaging-consent

**UI**
- Consent toggles in patient profile.

**Acceptance criteria** (write a test for each)
- [ ] Opted-out patients never receive marketing messages (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 020 is ticked in §5.

### Step 021 · CL-02 · Rx safety checks by ingredient (interactions, allergies, duplicates)

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 005 (CL-01) |
| **Branch** | `kiorly/CL-02-rx-safety-checks-by-ingredient-interacti` |

**Goal.** Safety checks are only useful when they work on ingredients, not names.

**Current state (inspect first).** clinical-safety.service matches by drug name; PatientAllergyCode enum.

**Build**
- Interaction rules keyed by ingredient pairs (severity: minor, moderate, major, contraindicated).
- Checks on save: drug-drug, drug-allergy (ingredient and class), therapeutic duplication.
- Major/contraindicated requires an override reason (audited); free-text drugs show "not checked".
- Licensed interaction dataset or curated starter set reviewed by the medical advisory board.

**API**
- POST /clinical/rx/check { patientId, items[] } → alerts

**UI**
- Inline alerts with severity colours and Arabic text.

**Acceptance criteria** (write a test for each)
- [ ] Free-text medication shows a visible "safety check unavailable" note.
- [ ] Override reason stored with the encounter and audited.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 021 is ticked in §5.

### Step 022 · AI-03 · Honest AI labels across the product

| | |
|---|---|
| **Workstream** | AI features |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/AI-03-honest-ai-labels-across-the-product` |

**Goal.** Pre-visit summary is a template and no-show risk is a formula. Overclaiming AI damages trust with doctors and investors.

**Current state (inspect first).** Features exist with AI branding.

**Build**
- Label rule-based features as "smart summary" / "risk estimate" until real models ship; AI badge only on model-backed features.

**API**
- None.

**UI**
- Copy changes in en.json / ar.json.

**Acceptance criteria** (write a test for each)
- [ ] Marketing site and in-app copy match what each feature actually does.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 022 is ticked in §5.

### Step 023 · SC-03 · Consent enforcement in code (AI, marketplace, messaging)

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/SC-03-consent-enforcement-in-code-ai-marketpla` |

**Goal.** Consent recorded but not checked is a compliance gap.

**Current state (inspect first).** POST /compliance/patients/:id/data-protection-consent.

**Build**
- ConsentPolicy.require(patientId, purpose) used by AiGateway, marketplace sharing, marketing messaging.
- Consent capture at check-in (tablet signature or receptionist attestation) and from Kiorex bookings.

**API**
- GET /patients/:id/consents

**UI**
- Consent status chip on the patient header.

**Acceptance criteria** (write a test for each)
- [ ] Missing consent blocks the action with a clear message (tests per purpose).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 023 is ticked in §5.

### Step 024 · GT-02 · Legal pack: terms, subscription & fee terms, DPA, privacy notice

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | — |
| **Status in repo** | Missing |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/GT-02-legal-pack-terms-subscription-fee-terms` |

**Goal.** Required before charging anyone or listing doctors.

**Current state (inspect first).** Docs say legal review required.

**Build**
- Terms of service, subscription terms (trial, renewal, dunning), Kiorex marketplace fee terms (new-patient rule, disputes), DPA with clinics, patient privacy notice (AR), acceptable use, refund policy.
- Versioned acceptance stored per user/tenant.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model LegalAcceptance { id String @id @default(cuid())  tenantId String  userId String  document String  version String  acceptedAt DateTime @default(now())  ip String? }
```

**API**
- GET /public/legal/:doc
- POST /legal/accept

**UI**
- Acceptance at signup and on version change.

**Acceptance criteria** (write a test for each)
- [ ] Cannot start a paid plan without accepting current terms.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 024 is ticked in §5.

---

## Stage C · Money engine

> Trial, credits, invoices, collections. Steps 025–036.

### Step 025 · PL-09 · Founding cohort & 24-month price lock

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro, Clinic |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01), Step 008 (PL-02) |
| **Branch** | `kiorly/PL-09-founding-cohort-24-month-price-lock` |

**Goal.** The first 500 paying clinics get launch pricing locked for 24 months, which creates urgency and loyalty.

**Current state (inspect first).** Nothing.

**Build**
- Cohort config: key, market, cap, open/close dates, trialDays override, priceLockMonths.
- On signup or first payment, assign the cohort if seats remain (atomic counter), set Subscription.cohortKey and priceLockUntil.
- Price versioning respects priceLockUntil for renewals.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model Cohort {
  key             String   @id
  marketId        String
  cap             Int
  assignedCount   Int      @default(0)
  opensAt         DateTime
  closesAt        DateTime?
  trialDays       Int?
  priceLockMonths Int      @default(24)
}
```

**API**
- GET /public/cohorts/:key/remaining (for the website counter)

**UI**
- Badge "Founding clinic #123" on the plan page.

**Acceptance criteria** (write a test for each)
- [ ] Concurrency test: 600 parallel assignments → exactly 500 get the cohort.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 025 is ticked in §5.

### Step 026 · CR-01 · Trial engine (6-month founding trial, standard trial, activation rule)

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | Pro, Clinic |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02), Step 025 (PL-09) |
| **Branch** | `kiorly/CR-01-trial-engine-6-month-founding-trial-stan` |

**Goal.** Your plan: Kiorly free for the first 6 months, then paid. The engine makes trial length a config value per market and cohort, with an activation condition so the long trial goes to clinics that actually use it.

**Current state (inspect first).** Nothing.

**Build**
- Trial starts at signup on the chosen plan (default PRO); trialDays = cohort.trialDays ?? market.trial.standardDays.
- Activation rule (config): e.g. ≥ 20 appointments with status CHECKED_IN or COMPLETED within 30 days. Set Subscription.activatedAt when met.
- If the founding trial is not activated by day 30 → trial shortens to standard days (notify the owner first, at day 21).
- Notifications at trialEnd −14, −7, −3, 0 days via WhatsApp, email and in-app.
- At trial end: payment method present → first invoice (ACTIVE). No method → 7-day grace → automatic downgrade to LITE (not lock-out). Pro data stays, Pro features become read-only.
- Commission during trial follows trial.commissionPolicy (CR-06).

**API**
- GET /billing/trial → { endsAt, daysLeft, activated, activationProgress }
- Platform: POST /admin/platform/tenants/:id/extend-trial { days, reason }

**UI**
- Trial banner with days left and activation progress ("12 of 20 visits to unlock your 6-month trial").

**Acceptance criteria** (write a test for each)
- [ ] Founding trial = 180 days when activated, 90 days when not; both values come from config.
- [ ] Downgrade to Lite never deletes or hides clinical records.
- [ ] All trial transitions logged as SubscriptionEvent.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 026 is ticked in §5.

### Step 027 · CR-02 · Booking attribution & the "new patient" rule

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 002 (FD-01) |
| **Branch** | `kiorly/CR-02-booking-attribution-the-new-patient-rule` |

**Goal.** Commission is only fair if it's charged for the right bookings: new patients who came from Kiorex search, not the clinic's own regulars or its own booking link.

**Current state (inspect first).** Appointment has integrationClientId + externalReference; Patient.acquisitionChannel enum (social, website, doctor referral, other). No booking source.

**Build**
- Add Appointment.bookingSource enum and attributionJson (Kiorex search id, campaign, landing page).
- Add KIOREX to PatientAcquisitionChannel.
- NewPatientService.isNewToTenant(tenantId, phone, nationalId, atDate): no attended appointment or signed encounter in lookback months (config 24). Normalise phone to E.164 with libphonenumber; nationalId exact.
- Persist the decision on the appointment (isNewPatientAtBooking, newPatientCheckedAt) so later edits don't change billing silently.
- Front-desk created appointments default to FRONT_DESK; integration ones to INTEGRATION; Kiorex connector sets KIOREX_*.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum BookingSource { FRONT_DESK PHONE WALK_IN CLINIC_LINK KIOREX_MARKETPLACE KIOREX_WHATSAPP INTEGRATION IMPORT }
model Appointment {
  bookingSource          BookingSource @default(FRONT_DESK)
  attributionJson        Json?
  isNewPatientAtBooking  Boolean?
  newPatientCheckedAt    DateTime?
}
```

**API**
- Included in appointment payloads; filter ?bookingSource= on list endpoints.

**UI**
- Small source badge on appointment cards (Kiorex logo for marketplace bookings, "New" chip).

**Acceptance criteria** (write a test for each)
- [ ] Matrix test: same phone with a visit 23 months ago → not new; 25 months → new; nationalId match with a different phone → not new.
- [ ] CLINIC_LINK bookings are never marked chargeable regardless of new status.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 027 is ticked in §5.

### Step 028 · CR-04 · Kiorex fee configuration with competitor benchmark guardrail

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01) |
| **Branch** | `kiorly/CR-04-kiorex-fee-configuration-with-competitor` |

**Goal.** Your goal is a Kiorex fee about 50% below the cheapest competitor. Make the fee configurable per market and specialty, record the benchmark, and warn when a fee drifts above the target.

**Current state (inspect first).** Nothing.

**Build**
- KiorexCommissionRate per market (optional specialty), FLAT or PERCENT (of the visit fee), min/max, validity window.
- Benchmark fields: lowest competitor fee (flat or percent), source note, checkedAt; target ratio from config (0.5).
- Admin UI shows the effective fee next to the benchmark and a warning when fee > ratio × benchmark (warning only, not a block).
- Optional Lite monthly cap per market.
- Rate resolution: specialty rate → market default.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum FeeType { FLAT PERCENT }
model KiorexCommissionRate {
  id                     String    @id @default(cuid())
  marketId               String
  specialty              ClinicalSpecialty?
  feeType                FeeType   @default(FLAT)
  amount                 Decimal?  @db.Decimal(14, 2)
  percent                Decimal?  @db.Decimal(5, 2)
  minAmount              Decimal?  @db.Decimal(14, 2)
  maxAmount              Decimal?  @db.Decimal(14, 2)
  benchmarkFlat          Decimal?  @db.Decimal(14, 2)
  benchmarkPercent       Decimal?  @db.Decimal(5, 2)
  benchmarkSource        String?
  benchmarkCheckedAt     DateTime?
  validFrom              DateTime  @default(now())
  validTo                DateTime?
  @@index([marketId, specialty])
}
```

**API**
- Platform: CRUD /admin/platform/kiorex-rates
- GET /public/kiorex-fees?market=EG (for the pricing page)

**UI**
- Rates table with a red "above 50% target" chip when applicable.

**Acceptance criteria** (write a test for each)
- [ ] Resolution test: specialty override beats market default; expired rows ignored.
- [ ] PERCENT rates respect min/max.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 028 is ticked in §5.

### Step 029 · SB-01 · Kiorly invoices (separate from clinic patient invoices)

| | |
|---|---|
| **Workstream** | Kiorly billing & collections |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02) |
| **Branch** | `kiorly/SB-01-kiorly-invoices-separate-from-clinic-pat` |

**Goal.** Kiorly bills clinics; clinics bill patients. Mixing them in the existing Invoice model would corrupt clinic finance flows.

**Current state (inspect first).** Invoice / InvoiceLine exist for patient invoices (keep them untouched).

**Build**
- KiorlyInvoice and KiorlyInvoiceLine in a new billing-platform module (respect module-boundaries test).
- Invoice numbering per market with a gapless sequence (KIO-EG-2027-000123).
- Statuses: DRAFT, ISSUED, PAID, PARTIALLY_PAID, VOID, UNCOLLECTIBLE; due date = issue + 7 days (config).
- Void only via credit invoice; never edit issued invoices.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum KiorlyInvoiceStatus { DRAFT ISSUED PAID PARTIALLY_PAID VOID UNCOLLECTIBLE }
enum KiorlyLineType { SUBSCRIPTION SEAT ADDON USAGE_OVERAGE KIOREX_COMMISSION KIOREX_COMMISSION_OFFSET PREPAID CREDIT DISCOUNT TAX }
model KiorlyInvoice {
  id             String              @id @default(cuid())
  tenantId       String
  number         String              @unique
  periodKey      String
  periodStart    DateTime
  periodEnd      DateTime
  status         KiorlyInvoiceStatus @default(DRAFT)
  currency       String
  subtotal       Decimal             @db.Decimal(14, 2)
  creditsApplied Decimal             @default(0) @db.Decimal(14, 2)
  tax            Decimal             @db.Decimal(14, 2)
  total          Decimal             @db.Decimal(14, 2)
  amountPaid     Decimal             @default(0) @db.Decimal(14, 2)
  issuedAt       DateTime?
  dueAt          DateTime?
  paidAt         DateTime?
  lines          KiorlyInvoiceLine[]
  @@unique([tenantId, periodKey])
}
model KiorlyInvoiceLine {
  id          String         @id @default(cuid())
  invoiceId   String
  invoice     KiorlyInvoice  @relation(fields: [invoiceId], references: [id])
  type        KiorlyLineType
  descEn      String
  descAr      String
  quantity    Decimal        @db.Decimal(14, 2)
  unitAmount  Decimal        @db.Decimal(14, 2)
  amount      Decimal        @db.Decimal(14, 2)
  refId       String?
}
```

**API**
- GET /billing/invoices, GET /billing/invoices/:id (?format=pdf)

**UI**
- Invoices table with status chips and Pay button.

**Acceptance criteria** (write a test for each)
- [ ] Numbering is gapless under concurrency.
- [ ] No code path updates lines of an ISSUED invoice (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 029 is ticked in §5.

### Step 030 · SB-02 · Payment collection: cards, Fawry, InstaPay, bank transfer

| | |
|---|---|
| **Workstream** | Kiorly billing & collections |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | Pro, Clinic, Ent., Lite commissions |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 029 (SB-01) |
| **Branch** | `kiorly/SB-02-payment-collection-cards-fawry-instapay` |

**Goal.** Egyptian clinics pay in different ways. Recurring card is the smoothest; Fawry and InstaPay are widely used.

**Current state (inspect first).** Market.paymentMethods and TenantPaymentChannel exist for clinic-side collections (patient payments), not for Kiorly billing.

**Build**
- PaymentGateway provider interface (same provider pattern as providers/ai): createPaymentLink, tokenizeCard, chargeToken, handleWebhook, refund.
- EG providers: a card acquirer/aggregator (e.g. Paymob) with tokenization for auto-charge; Fawry reference codes; InstaPay with proof upload and ops verification; bank transfer with ops verification.
- KiorlyPayment and KiorlyPaymentMethod (token reference only, never card data).
- Webhook signature verification, idempotency keys, reconciliation job comparing gateway settlements with payments.
- Auto-charge the default card on invoice issue; retry D+1, D+3, D+7.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model KiorlyPaymentMethod {
  id          String   @id @default(cuid())
  tenantId    String
  provider    String           // "paymob", "fawry", "instapay", "bank"
  kind        String           // CARD_TOKEN, MANUAL
  tokenRef    String?          // provider token id, never PAN
  brand       String?
  last4       String?
  expMonth    Int?
  expYear     Int?
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
}
model KiorlyPayment {
  id              String   @id @default(cuid())
  tenantId        String
  invoiceId       String?
  provider        String
  providerRef     String   @unique
  amount          Decimal  @db.Decimal(14, 2)
  currency        String
  status          String           // PENDING SUCCEEDED FAILED REFUNDED UNDER_REVIEW
  proofUploadKey  String?
  verifiedBy      String?
  createdAt       DateTime @default(now())
}
```

**API**
- POST /billing/payment-methods/card-session
- POST /billing/invoices/:id/pay { method }
- POST /webhooks/payments/:provider (public, signed)
- Platform: POST /admin/platform/payments/:id/verify

**UI**
- Pay modal: card (saved or new), Fawry code, InstaPay with upload; status polling.

**Acceptance criteria** (write a test for each)
- [ ] Replaying the same webhook twice records one payment.
- [ ] Manual InstaPay payments stay UNDER_REVIEW until verified; the invoice shows "payment under review" and dunning pauses.
- [ ] No PAN or CVV ever reaches the Kiorly API (hosted fields or redirect).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 030 is ticked in §5.

### Step 031 · CR-03 · Kiorex commission charge capture & lifecycle

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 027 (CR-02), Step 028 (CR-04) |
| **Branch** | `kiorly/CR-03-kiorex-commission-charge-capture-lifecyc` |

**Goal.** One immutable charge row per attended new Kiorex patient is the basis for credits, invoices, disputes and the "free" meter.

**Current state (inspect first).** Nothing. Check-in and check-in revert logic exists in front-desk (appointment-check-in-revert.ts).

**Build**
- KiorexCommissionCharge with unique appointmentId.
- Create PENDING on check-in when bookingSource ∈ KIOREX_* and isNewPatientAtBooking; snapshot the rate and amount at that moment.
- CONFIRMED on encounter sign-off or appointment completion, or automatically 24h after check-in (job).
- REVERSED on check-in revert, appointment deletion or an approved dispute; if already BILLED → create a credit for the next period (CR-05).
- No charge on NO_SHOW or CANCELLED; reschedule moves the appointment, not the charge.
- Emit outbox events COMMISSION_CHARGE_CREATED / REVERSED for Kiorex reconciliation.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum CommissionChargeStatus { PENDING CONFIRMED DISPUTED REVERSED WAIVED BILLED }
model KiorexCommissionCharge {
  id              String                 @id @default(cuid())
  tenantId        String
  clinicId        String
  appointmentId   String                 @unique
  patientId       String
  clinicianId     String
  rateId          String
  amount          Decimal                @db.Decimal(14, 2)
  currency        String
  status          CommissionChargeStatus @default(PENDING)
  attendedAt      DateTime
  confirmedAt     DateTime?
  disputeDeadline DateTime
  kiorlyInvoiceId String?
  reversalReason  String?
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt
  @@index([tenantId, status, attendedAt])
}
```

**API**
- GET /billing/kiorex/charges?period=&status=
- Internal: CommissionChargeService.onCheckIn / onRevert / onComplete

**UI**
- Kiorex tab: list of charged visits (date, doctor, patient initials, amount, status, dispute button).

**Acceptance criteria** (write a test for each)
- [ ] Check-in → revert → check-in again yields exactly one active charge.
- [ ] Rate changes after a charge never alter its amount.
- [ ] Integration test across front-desk check-in, revert and completion.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 031 is ticked in §5.

### Step 032 · CR-06 · Monthly settlement engine ("pay the higher of, never both")

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 031 (CR-03), Step 012 (CR-05), Step 029 (SB-01) |
| **Branch** | `kiorly/CR-06-monthly-settlement-engine-pay-the-higher` |

**Goal.** Turns the subscription, commissions, trial policy, prepaid months and wallet credits into one correct invoice. This is where money bugs would hurt most.

**Current state (inspect first).** Nothing.

**Build**
- Implement settlePeriod() exactly as in section 04 (pseudocode), as a pure calculation function + a persistence wrapper.
- Trial commission policy config: WAIVE_ALL | WAIVE_UP_TO_PLAN_PRICE (default) | CHARGE.
- Invoice lines: SUBSCRIPTION, SEAT, ADDON, USAGE_OVERAGE, KIOREX_COMMISSION, KIOREX_COMMISSION_OFFSET (negative, informational), PREPAID (negative), CREDIT (negative), TAX.
- Lite: commission only; carry forward below liteMinInvoice; optional monthly cap.
- Dry-run endpoint for any tenant and period (used by ops and tests).
- Run on the 1st of each month 02:00 Africa/Cairo for the previous period; re-runnable; DRAFT invoices can be regenerated until issued.

**API**
- GET /billing/settlement/preview?period=2027-04 (owner: own tenant; platform: any)
- Platform: POST /admin/platform/settlement/run { period, tenantIds? }

**UI**
- Invoice detail shows the "higher of" explanation in plain language: "Kiorex sent you 30 new patients (EGP 1,200). That covers your Pro subscription (EGP 999), so Kiorly was free this month."

**Acceptance criteria** (write a test for each)
- [ ] All nine worked examples from section 04 are automated test cases with exact expected totals.
- [ ] Running settlement twice produces one invoice.
- [ ] Rounding: 2 decimals, half-up, applied once per line; totals reconcile to the cent.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 032 is ticked in §5.

### Step 033 · QA-03 · Settlement & credit engine test matrix

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 032 (CR-06) |
| **Branch** | `kiorly/QA-03-settlement-credit-engine-test-matrix` |

**Goal.** Billing errors destroy trust in the "free" promise.

**Current state (inspect first).** Nothing.

**Build**
- Table-driven tests for the nine worked examples + edge cases: mid-period upgrade, seat change, trial ending mid-period, disputes after billing, annual prepay, Lite carry-forward, wallet expiry during settlement, currency rounding.
- Property-based tests (fast-check) for invariants: payable ≥ 0; payable ≤ max(S, C); Σ ledger = balance.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] All cases pass; invariants hold over 10,000 random runs.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 033 is ticked in §5.

### Step 034 · SB-03 · Dunning & access policy that never blocks clinical records

| | |
|---|---|
| **Workstream** | Kiorly billing & collections |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All paid |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 030 (SB-02), Step 008 (PL-02) |
| **Branch** | `kiorly/SB-03-dunning-access-policy-that-never-blocks` |

**Goal.** Collect money firmly without endangering patients or breaching record-keeping duties.

**Current state (inspect first).** Nothing.

**Build**
- Timeline (config): reminder D−3, D0; PAST_DUE D+1; GRACE D+1…D+14 (full access, red banner); READ_ONLY from D+15; SUSPENDED from D+45.
- READ_ONLY = no new appointments or Kiorex bookings, Pro features locked, but view, print and export of records always allowed.
- SUSPENDED = login allowed for the owner only, to pay or export.
- Marketplace listing paused from READ_ONLY (Kiorex shows "not taking online bookings").
- Lite with unpaid commission > 30 days: pause marketplace listing only.
- Reactivation is instant on successful payment.

**API**
- Middleware SubscriptionAccessGuard reading status → allowed action classes (READ, CLINICAL_WRITE, SCHEDULING_WRITE, BILLING, ADMIN).

**UI**
- Escalating banners; owner-only pay CTA; staff see "contact the clinic owner".

**Acceptance criteria** (write a test for each)
- [ ] E2E: a READ_ONLY tenant can open and print a patient chart and export data, and cannot create an appointment.
- [ ] State timeline is fully driven by config days.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 034 is ticked in §5.

### Step 035 · PA-02 · Commercial configuration UI (plans, trials, fees, dunning)

| | |
|---|---|
| **Workstream** | Platform admin console |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | Platform |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01), Step 028 (CR-04) |
| **Branch** | `kiorly/PA-02-commercial-configuration-ui-plans-trials` |

**Goal.** All commercial parameters (section 03) must be editable without deploys.

**Current state (inspect first).** Market config screens exist for packs and flags.

**Build**
- Per-market commercial config: trial days, activation rule, trial commission policy, Kiorex rates and benchmarks, Lite caps and minimum invoice, dunning days, referral reward, cohorts, prices (versioned).
- Change preview and audit.

**Data model** (adapt names to existing conventions; create a named migration)
```jsonc
// Market.commercialConfig (new JSON column, validated by zod)
{
  "trial": { "standardDays": 90, "foundingDays": 180,
             "activation": { "minVisits": 20, "withinDays": 30 },
             "commissionPolicy": "WAIVE_UP_TO_PLAN_PRICE" },
  "kiorex": { "newPatientLookbackMonths": 24, "disputeWindowDays": 7,
              "benchmarkTargetRatio": 0.5, "autoConfirmHours": 24 },
  "lite":   { "commissionMonthlyCap": null, "minInvoice": 100 },
  "dunning":{ "graceDays": 14, "readOnlyAfterDays": 15, "suspendAfterDays": 45 },
  "referral": { "rewardMonths": 1, "expiryMonths": 12, "maxPerYear": 12 }
}
```

**API**
- GET/PUT /admin/platform/markets/:id/commercial-config

**UI**
- Form with validation and help text.

**Acceptance criteria** (write a test for each)
- [ ] Invalid config is rejected; changes take effect without restart.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 035 is ticked in §5.

### Step 036 · SC-07 · Audit coverage for billing, credits and plan changes

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 012 (CR-05) |
| **Branch** | `kiorly/SC-07-audit-coverage-for-billing-credits-and-p` |

**Goal.** Every money-affecting change must be traceable.

**Current state (inspect first).** Audit interceptor and AuditLog.

**Build**
- Explicit audit events for subscription changes, credit grants, invoice issue/void, dispute decisions, rate changes, entitlement overrides.

**API**
- GET /admin/platform/audit?entity=

**UI**
- Audit tab per tenant.

**Acceptance criteria** (write a test for each)
- [ ] A test enumerates money-affecting service methods and asserts audit calls.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 036 is ticked in §5.

---

## Stage D · Kiorex connector

> Marketplace-ready supply. Steps 037–048.

### Step 037 · ON-03 · Doctor verification (Syndicate number, licence) for marketplace listing

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All (needed for Kiorex) |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 013 (ON-01) |
| **Branch** | `kiorly/ON-03-doctor-verification-syndicate-number-lic` |

**Goal.** Patients must only book verified doctors. Verification gates the Kiorex listing, not Kiorly usage.

**Current state (inspect first).** Clinic.licenseNumber exists; nothing per doctor.

**Build**
- ClinicianVerification: syndicate number, specialty, title, national ID (encrypted at rest), documents (syndicate card, specialty certificate, clinic licence), profile photo.
- Statuses: UNVERIFIED, PENDING, VERIFIED, REJECTED (with reason), EXPIRED.
- Platform review queue (PA-03) with checklist; re-verification on specialty change.
- Uploads through the existing storage module (S3, private, signed URLs).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum VerificationStatus { UNVERIFIED PENDING VERIFIED REJECTED EXPIRED }
model ClinicianVerification {
  id               String             @id @default(cuid())
  userId           String             @unique
  tenantId         String
  syndicateNumber  String?
  specialty        ClinicalSpecialty?
  titleEn          String?
  titleAr          String?
  nationalIdEnc    String?
  documentKeys     Json     @default("[]")
  status           VerificationStatus @default(UNVERIFIED)
  rejectReason     String?
  reviewedBy       String?
  reviewedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

**API**
- POST /clinicians/me/verification
- Platform: GET /admin/platform/verifications?status=PENDING, POST /admin/platform/verifications/:id/decision

**UI**
- Verification step in onboarding; status chip in the Kiorex tab.

**Acceptance criteria** (write a test for each)
- [ ] An unverified doctor cannot go LIVE on Kiorex (enforced in KX-01).
- [ ] Document URLs are never public.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 037 is ticked in §5.

### Step 038 · PA-03 · Verification review queue

| | |
|---|---|
| **Workstream** | Platform admin console |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | Platform |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 037 (ON-03) |
| **Branch** | `kiorly/PA-03-verification-review-queue` |

**Goal.** Fast verification = faster marketplace supply.

**Current state (inspect first).** Nothing.

**Build**
- Queue with documents viewer, checklist, approve/reject with templated reasons, SLA timer.

**API**
- See ON-03.

**UI**
- Queue screen.

**Acceptance criteria** (write a test for each)
- [ ] Median review time tracked.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 038 is ticked in §5.

### Step 039 · KX-01 · Platform-level Kiorex connector & per-doctor marketplace listing

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 037 (ON-03), Step 009 (PL-03) |
| **Branch** | `kiorly/KX-01-platform-level-kiorex-connector-per-doct` |

**Goal.** Kiorex is one platform talking to all tenants. Today integration clients are per tenant, which doesn't fit a marketplace.

**Current state (inspect first).** IntegrationClient (tenantId, allowedClinicIds), integration auth guard, endpoints: auth/verify, clinics, physicians, appointments/availability, create, get, cancel; 4 webhook events.

**Build**
- PlatformIntegrationClient (no tenantId) with scope MARKETPLACE, HMAC request signing + timestamp + nonce, IP allowlist optional.
- MarketplaceListing per clinician per clinic: status DRAFT, PENDING_VERIFICATION, LIVE, PAUSED (reason: owner, billing, verification, quality).
- Routing: every marketplace call carries clinicId; the API resolves the tenant from the listing.
- Listing goes LIVE only if: doctor VERIFIED, subscription not READ_ONLY/SUSPENDED, at least one bookable appointment type, availability configured.
- Separate URL namespace /marketplace/v1 with its own OpenAPI spec (apps/api/openapi).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
enum ListingStatus { DRAFT PENDING_VERIFICATION LIVE PAUSED }
model MarketplaceListing {
  id           String        @id @default(cuid())
  tenantId     String
  clinicId     String
  clinicianId  String
  status       ListingStatus @default(DRAFT)
  pausedReason String?
  profileJson  Json          @default("{}")
  listedAt     DateTime?
  updatedAt    DateTime      @updatedAt
  @@unique([clinicId, clinicianId])
}
model PlatformIntegrationClient {
  id         String   @id @default(cuid())
  name       String
  clientKey  String   @unique
  secretHash String
  scopes     String[]
  deactivatedAt DateTime?
}
```

**API**
- /marketplace/v1/* (see KX-02…KX-07)

**UI**
- Kiorex tab: listing status per doctor with the reasons blocking LIVE.

**Acceptance criteria** (write a test for each)
- [ ] A marketplace client cannot read data of a clinic without a LIVE or PAUSED listing.
- [ ] Contract tests (QA-04) run against the OpenAPI spec.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 039 is ticked in §5.

### Step 040 · KX-02 · Provider profile publishing

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 039 (KX-01) |
| **Branch** | `kiorly/KX-02-provider-profile-publishing` |

**Goal.** Kiorex search needs rich, accurate, bilingual profiles that the clinic controls from Kiorly.

**Current state (inspect first).** Clinic has names, address, locationUrl, phone, specialty, logo; users have displayName and avatar.

**Build**
- Profile fields: display names AR/EN, title, specialty + sub-specialties, gender, languages, bio AR/EN, education, years of experience, photo, fees per bookable appointment type, accepted payers (PayerCompany), clinic address AR/EN, lat/lng (add to Clinic), photos, amenities, parking, wheelchair access.
- Profile editor with live preview; changes to name/specialty re-trigger verification.
- Push PROVIDER_PROFILE_UPDATED via outbox (KX-05).

**API**
- GET/PUT /marketplace-listings/:id/profile (Kiorly UI)
- GET /marketplace/v1/providers?updatedSince= (Kiorex pull, paged)

**UI**
- Profile editor with completeness score.

**Acceptance criteria** (write a test for each)
- [ ] A profile below 80% completeness cannot go LIVE.
- [ ] Kiorex can fully resync with the paged endpoint.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 040 is ticked in §5.

### Step 041 · KX-03 · Canonical slot engine shared by Kiorly UI and Kiorex

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 006 (FS-01) |
| **Branch** | `kiorly/KX-03-canonical-slot-engine-shared-by-kiorly-u` |

**Goal.** One function decides what is bookable. If the UI and the marketplace compute slots differently, you get double bookings.

**Current state (inspect first).** scheduling.service availability + integrations-appointments availability; ClinicianAvailabilityTemplate.weekJson/blockedJson; leave blocks; Clinic.timezone; AppointmentType.durationMinutes.

**Build**
- SlotService.getSlots({clinicId, clinicianId?, typeId, from, to, channel}) using: templates, blocked periods, HR leave, existing appointments (non-cancelled), type duration and buffers (FS-01), room capacity, clinic timezone (store UTC, compute local).
- Channel rules for MARKETPLACE: only types with marketplaceBookable, minNoticeMinutes, maxDaysAhead, daily marketplace cap per doctor.
- Replace the two existing availability implementations with SlotService.
- Cache per clinician-day (60s) with invalidation on appointment/template change; emit SLOTS_CHANGED.

**API**
- GET /marketplace/v1/clinics/:clinicId/slots?clinicianId&typeId&from&to
- Internal: used by the scheduling UI and the waitlist

**UI**
- Same engine behind the front-desk calendar.

**Acceptance criteria** (write a test for each)
- [ ] Property test: no generated slot overlaps an existing appointment, leave or blocked period, in any timezone including DST edges.
- [ ] p95 < 150 ms for a 14-day window for one doctor.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 041 is ticked in §5.

### Step 042 · KX-04 · Booking intake: slot holds, idempotency, patient matching

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 041 (KX-03), Step 027 (CR-02) |
| **Branch** | `kiorly/KX-04-booking-intake-slot-holds-idempotency-pa` |

**Goal.** Marketplace bookings must be safe under concurrency, retries and deposits.

**Current state (inspect first).** POST integrations/appointments with externalReference uniqueness per integration client.

**Build**
- SlotHold (5 min, config) created when the patient picks a slot in Kiorex; confirmed booking consumes the hold; expired holds are released by job.
- POST /marketplace/v1/bookings with Idempotency-Key = Kiorex booking id (stored as externalReference with the platform client).
- Patient matching: normalised phone → nationalId → create; never merge automatically across conflicting national IDs.
- Set bookingSource, attributionJson, acquisitionChannel=KIOREX, consent record received from Kiorex (purpose: booking + reminders).
- Auto-confirm or manual-confirm per clinic setting; manual confirmations time out (config) with notification to Kiorex.
- 409 SLOT_TAKEN response includes the 3 nearest alternatives.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model SlotHold {
  id          String   @id @default(cuid())
  clinicId    String
  clinicianId String
  typeId      String
  startsAt    DateTime
  endsAt      DateTime
  externalRef String   @unique
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  @@index([clinicianId, startsAt])
}
```

**API**
- POST /marketplace/v1/holds
- DELETE /marketplace/v1/holds/:id
- POST /marketplace/v1/bookings
- GET /marketplace/v1/bookings/:externalRef

**UI**
- Kiorex bookings appear with the Kiorex badge; manual-confirm queue for front desk.

**Acceptance criteria** (write a test for each)
- [ ] Two parallel bookings for one slot: exactly one succeeds.
- [ ] Retrying the same booking returns the same appointment.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 042 is ticked in §5.

### Step 043 · KX-05 · Transactional outbox & full status event set

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 039 (KX-01) |
| **Branch** | `kiorly/KX-05-transactional-outbox-full-status-event-s` |

**Goal.** Kiorex must know every status change reliably, or patients get wrong information and commissions drift.

**Current state (inspect first).** IntegrationWebhook with 4 events; integration-webhook.service sends HTTP; failure logs.

**Build**
- OutboxEvent table written in the same DB transaction as the domain change.
- Dispatcher worker: ordered per aggregate, retries with exponential backoff, DLQ after N attempts, visible in Governance.
- Events: APPOINTMENT_CONFIRMED, RESCHEDULED, CANCELLED_BY_CLINIC, CANCELLED_BY_PATIENT, CHECKED_IN, CHECK_IN_REVERTED, COMPLETED, NO_SHOW, PROVIDER_PROFILE_UPDATED, LISTING_STATUS_CHANGED, SLOTS_CHANGED, COMMISSION_CHARGE_CREATED, COMMISSION_CHARGE_REVERSED.
- Signed payloads (HMAC) with event id for dedupe; existing tenant webhooks reuse the same outbox.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model OutboxEvent {
  id            String   @id @default(cuid())
  aggregateType String
  aggregateId   String
  type          String
  payload       Json
  target        String           // KIOREX | TENANT_WEBHOOK:<id>
  status        String   @default("PENDING") // PENDING SENT FAILED DEAD
  attempts      Int      @default(0)
  nextAttemptAt DateTime @default(now())
  createdAt     DateTime @default(now())
  sentAt        DateTime?
  @@index([status, nextAttemptAt])
}
```

**API**
- Kiorex receiver contract documented in OpenAPI (webhooks section).

**UI**
- Governance → Outbox with retry button.

**Acceptance criteria** (write a test for each)
- [ ] Killing the worker mid-send loses no events and duplicates are harmless (event id).
- [ ] Lag alert when the oldest PENDING > 2 minutes.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 043 is ticked in §5.

### Step 044 · QA-01 · Golden-flow end-to-end tests (Playwright)

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/QA-01-golden-flow-end-to-end-tests-playwright` |

**Goal.** The definition of done for launch.

**Current state (inspect first).** Playwright e2e for auth, RBAC, clinics, encounters, HR, scheduling, theme, responsive.

**Build**
- E2E: book → check-in (InstaPay) → visit → Rx (drug from DB) → split pay → cash close → doctor statement.
- Same flow for Lite owner-physician and for a Kiorex booking with deposit.
- Run in CI on every PR; AR and EN.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Green on CI; failures block merge.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 044 is ticked in §5.

### Step 045 · QA-02 · Money-path API tests

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/QA-02-money-path-api-tests` |

**Goal.** Revenue posting has a single-path test; other money paths are not tested.

**Current state (inspect first).** 60 *.node.test.ts files (many cover the ETA code being retired); single revenue path test.

**Build**
- Integration tests for payments, allocations, refunds, cash close, packages, revenue share, subscription changes, settlement, wallet.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Coverage report for billing, billing-platform and credits modules ≥ 85% lines.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 045 is ticked in §5.

### Step 046 · QA-05 · Observability & alerting for money and booking paths

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/QA-05-observability-alerting-for-money-and-boo` |

**Goal.** You need to know about failures before clinics call.

**Current state (inspect first).** Health endpoints, integration failure UI, spike audit.

**Build**
- Error tracking + tracing (e.g. Sentry/OpenTelemetry); dashboards: WhatsApp delivery, outbox lag, settlement job, payment webhooks, signup funnel.
- Alerts to on-call (WhatsApp/Slack).

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Each alert has a runbook entry.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 046 is ticked in §5.

### Step 047 · AI-01 · Compliant AI hosting & consent-checked AI gateway

| | |
|---|---|
| **Workstream** | AI features |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All with AI |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 004 (SC-01), Step 023 (SC-03) |
| **Branch** | `kiorly/AI-01-compliant-ai-hosting-consent-checked-ai` |

**Goal.** Patient data sent to an AI provider is an extra transfer. It must be covered by the Frankfurt transfer approval (SC-01) and by patient consent, and the gateway must enforce both.

**Current state (inspect first).** providers/ai, Market.providerConfig.ai, ai_assistant flag, identifier redaction in assistant prompts.

**Build**
- AiGateway: every AI call passes purpose + patientId; checks consent and market transfer policy before calling the provider.
- Provider per market: an EU-hosted endpoint consistent with the Frankfurt approval (e.g. OpenAI with EU data residency), or later a self-hosted model in eu-central-1. The provider must be on the approved sub-processor list (SC-01).
- Logs without PHI; per-tenant cost metering (PL-05).

**API**
- Internal.

**UI**
- AI features show a consent-required state when missing.

**Acceptance criteria** (write a test for each)
- [ ] No provider call happens without a passing consent check (test with a mocked provider).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 047 is ticked in §5.

### Step 048 · SC-02 · PDPC licences, DPO, privacy notice (business tasks)

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Human task — Cursor only prepares docs/templates and the small code hooks listed, then stops |
| **Depends on** | Step 004 (SC-01) |
| **Branch** | `kiorly/SC-02-pdpc-licences-dpo-privacy-notice-busines` |

**Goal.** Legal prerequisites to process Egyptian personal data.

**Current state (inspect first).** Documented in Docs/markets/egypt.md.

**Build**
- Appoint and register the DPO; apply for any licences not already covered by the SC-01 approval; Arabic privacy notice; records of processing; breach procedure (72h PDPC, 3 days to subjects).

**API**
- None.

**UI**
- Privacy notice link in signup and patient-facing pages.

**Acceptance criteria** (write a test for each)
- [ ] Licences or filings in hand before the paid launch.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 048 is ticked in §5.

---

## Stage E · Launch completeness

> Everything for public launch. Steps 049–100.

### Step 049 · PL-07 · Upgrade, downgrade, seat changes & proration

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02), Step 029 (SB-01) |
| **Branch** | `kiorly/PL-07-upgrade-downgrade-seat-changes-proration` |

**Goal.** Clinics grow (2nd doctor) and shrink. Changes must be instant, fairly priced and never lose data.

**Current state (inspect first).** Nothing.

**Build**
- Preview endpoint returns proration: credit for the unused old plan and charge for the new one from today, both daily-prorated.
- Upgrade: immediate. Downgrade: at period end by default; immediate allowed with no refund.
- Downgrade over limits: owner chooses which clinicians stay active; others become read-only (cannot book or sign), data kept.
- Seat change for PER_CLINICIAN plans: add seat now (prorated), remove at period end.
- Annual: upgrades prorate the remaining months; downgrades take effect at renewal.

**API**
- POST /billing/subscription/preview-change
- POST /billing/subscription/change-plan
- POST /billing/subscription/seats

**UI**
- Compare-plans modal with the preview amount and the effective date.

**Acceptance criteria** (write a test for each)
- [ ] Proration tests: mid-month upgrade, mid-month seat add, annual upgrade at month 5.
- [ ] Downgrade from Clinic (4 doctors) to Pro (1 seat) makes 3 doctors read-only and keeps all their encounters.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 049 is ticked in §5.

### Step 050 · CR-07 · "Kiorly is free" progress meter & nudges

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro, Clinic |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 031 (CR-03), Step 032 (CR-06) |
| **Branch** | `kiorly/CR-07-kiorly-is-free-progress-meter-nudges` |

**Goal.** The progress meter makes the model tangible and drives clinics to share and accept Kiorex bookings.

**Current state (inspect first).** Nothing.

**Build**
- Endpoint computing current-period S, C, patients attended, patients still needed = ceil((S − C) / currentFee), isFree.
- Dashboard widget and Kiorex tab card with a progress ring.
- WhatsApp/in-app nudges to the owner at 50%, 80% and 100% ("Kiorly is free this month").
- Monthly recap message with the amount saved.

**API**
- GET /billing/kiorex-progress

**UI**
- Ring: "17 of 25 Kiorex patients · 8 more and Kiorly is free this month".

**Acceptance criteria** (write a test for each)
- [ ] Meter matches the settlement preview for the same period.
- [ ] Nudges are sent once per threshold per period.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 050 is ticked in §5.

### Step 051 · PL-08 · Plan & billing page, paywall moments and upgrade prompts

| | |
|---|---|
| **Workstream** | Plans, tiers & entitlements |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 009 (PL-03), Step 050 (CR-07) |
| **Branch** | `kiorly/PL-08-plan-billing-page-paywall-moments-and-up` |

**Goal.** Upgrades happen at the moment of need: adding a doctor, exporting reports on Lite, taking a deposit, hitting a WhatsApp quota.

**Current state (inspect first).** Nothing.

**Build**
- Admin → Plan & billing page: plan card, trial countdown, Kiorex progress (CR-07), usage, invoices, payment methods, wallet balance.
- UpgradeModal component triggered by any 402 PLAN_UPGRADE_REQUIRED response (global API interceptor in web).
- Contextual triggers: add clinician, deposit toggle, export button, 2nd branch, WhatsApp quota.
- Analytics event per paywall view and conversion (for PA-05).

**API**
- Uses PL-02/PL-03/SB endpoints.

**UI**
- Copy in Egyptian Arabic and English; owner-only actions, others see "ask the clinic owner".

**Acceptance criteria** (write a test for each)
- [ ] Every 402 from the API opens the modal with the right plan comparison.
- [ ] Non-owners never see payment forms.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 051 is ticked in §5.

### Step 052 · CR-08 · Commission disputes & adjustments

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 031 (CR-03) |
| **Branch** | `kiorly/CR-08-commission-disputes-adjustments` |

**Goal.** Clinics will challenge some charges. A fast, fair process protects trust and keeps support load low.

**Current state (inspect first).** Nothing.

**Build**
- Clinic can dispute a charge within disputeWindowDays (7) with a reason: EXISTING_PATIENT, DID_NOT_ATTEND, DUPLICATE, OTHER (+ note).
- Auto-resolution: EXISTING_PATIENT is approved automatically if a prior visit is found under another phone or national ID; DUPLICATE if another charge exists for the same patient within 7 days.
- Ops queue for the rest, with SLA 3 working days.
- Approved: REVERSED (or a credit next period if already BILLED). Rejected: back to CONFIRMED with a reply.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model CommissionDispute {
  id         String   @id @default(cuid())
  chargeId   String   @unique
  reason     String
  note       String?
  status     String   @default("OPEN")   // OPEN AUTO_APPROVED APPROVED REJECTED
  resolvedBy String?
  resolution String?
  createdAt  DateTime @default(now())
  resolvedAt DateTime?
}
```

**API**
- POST /billing/kiorex/charges/:id/dispute
- Platform: GET /admin/platform/disputes, POST /admin/platform/disputes/:id/resolve

**UI**
- Dispute button and status on each charge; ops queue in platform admin.

**Acceptance criteria** (write a test for each)
- [ ] Disputes after the window are refused with a clear message.
- [ ] Every resolution is audited and notifies the owner.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 052 is ticked in §5.

### Step 053 · CR-09 · Doctor-to-doctor referral credits

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 012 (CR-05), Step 013 (ON-01) |
| **Branch** | `kiorly/CR-09-doctor-to-doctor-referral-credits` |

**Goal.** Referrals are the cheapest acquisition channel. Both the referrer and the new clinic earn one month of Pro as credit.

**Current state (inspect first).** Nothing.

**Build**
- ReferralCode per tenant (short, shareable, also as a link with the code).
- Signup accepts ?ref=CODE; store on Subscription.referralCodeUsed.
- Reward when the referred tenant pays its first full period: GRANT REFERRAL credit equal to one month of their plan to both wallets, expiring in 12 months.
- Fraud guards: same phone, national ID, device or payment card → no reward; cap of 12 rewards per year per referrer (config).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model ReferralCode { code String @id  tenantId String @unique  createdAt DateTime @default(now()) }
model Referral {
  id               String   @id @default(cuid())
  code             String
  referredTenantId String   @unique
  status           String   @default("PENDING")  // PENDING REWARDED REJECTED
  rewardedAt       DateTime?
  rejectReason     String?
}
```

**API**
- GET /growth/referral (my code, link, referrals and rewards)

**UI**
- "Invite a colleague" card with WhatsApp share and a QR code.

**Acceptance criteria** (write a test for each)
- [ ] Reward fires once, only after the first paid period, and writes two ledger entries.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 053 is ticked in §5.

### Step 054 · CR-11 · Monthly statement for clinics (PDF + in-app)

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 032 (CR-06) |
| **Branch** | `kiorly/CR-11-monthly-statement-for-clinics-pdf-in-app` |

**Goal.** Owners must see exactly why they paid what they paid: trust is the whole basis of the credit model.

**Current state (inspect first).** Invoice PDF generation exists for clinic invoices (reuse styling).

**Build**
- Statement per period: subscription, list of Kiorex patients (date, doctor, initials, fee), commission total, offset, credits used, wallet balance, net payable, VAT, payments.
- Bilingual PDF; also sent on WhatsApp and email when the invoice is issued.

**API**
- GET /billing/statements/:period (JSON + ?format=pdf)

**UI**
- Statements list on Plan & billing.

**Acceptance criteria** (write a test for each)
- [x] Statement totals equal the invoice totals for every test case in CR-06.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 054 is ticked in §5.

### Step 055 · SB-05 · Lite commission invoicing & minimum invoice

| | |
|---|---|
| **Workstream** | Kiorly billing & collections |
| **Priority** | Launch (before public launch) |
| **Tiers** | Lite |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 032 (CR-06), Step 029 (SB-01) |
| **Branch** | `kiorly/SB-05-lite-commission-invoicing-minimum-invoic` |

**Goal.** Lite doctors pay nothing except commission on attended new Kiorex patients. Small amounts shouldn't create noise.

**Current state (inspect first).** Nothing.

**Build**
- Settlement for Lite creates an invoice only when payable ≥ liteMinInvoice (EGP 100); otherwise carry forward.
- Payment by card token, Fawry or InstaPay as SB-02.
- Unpaid > 30 days → marketplace listing paused (Kiorly itself keeps working).

**API**
- Same as SB-01/02.

**UI**
- Lite plan page shows "Kiorex fees this month" instead of subscription.

**Acceptance criteria** (write a test for each)
- [ ] Carry-forward balance is shown and included next month.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 055 is ticked in §5.

### Step 056 · SB-06 · Currency, price indexation & grandfathering

| | |
|---|---|
| **Workstream** | Kiorly billing & collections |
| **Priority** | Launch (before public launch) |
| **Tiers** | Paid |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01), Step 025 (PL-09) |
| **Branch** | `kiorly/SB-06-currency-price-indexation-grandfathering` |

**Goal.** EGP volatility means prices will change. Changes must be predictable and respect founding locks.

**Current state (inspect first).** Nothing.

**Build**
- New PlanPrice version → existing subscriptions move at their next renewal after a 30-day notice, unless priceLockUntil is in the future.
- Notice job sends bilingual messages and records consent-by-continuing.
- Admin report of who moves when.

**API**
- Platform: POST /admin/platform/plans/:id/prices (new version) → preview impact

**UI**
- Impact preview: tenants affected, MRR delta.

**Acceptance criteria** (write a test for each)
- [ ] Founding tenants never get a price change before priceLockUntil.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 056 is ticked in §5.

### Step 057 · ON-05 · Data import from Excel / CSV (patients, appointments, price list, staff)

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 016 (ON-04) |
| **Branch** | `kiorly/ON-05-data-import-from-excel-csv-patients-appo` |

**Goal.** "We move you in 48 hours" is a core sales promise. Most clinics live in Excel or paper.

**Current state (inspect first).** Planned.

**Build**
- Downloadable templates (AR/EN headers) per entity.
- Upload → parse (xlsx/csv) → validate (phones, dates in dd/mm/yyyy, Arabic names, national ID format) → preview with row errors → commit as a background ImportJob.
- Dedupe patients by phone / national ID; merge rules shown before commit.
- Undo window 24h (delete rows created by the job if untouched).
- Field-rep mode: import on behalf of the clinic (ON-07).

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model ImportJob {
  id         String   @id @default(cuid())
  tenantId   String
  entity     String           // PATIENTS APPOINTMENTS PRICE_LIST STAFF
  fileKey    String
  status     String           // VALIDATING READY COMMITTING DONE FAILED UNDONE
  totalRows  Int      @default(0)
  okRows     Int      @default(0)
  errorRows  Int      @default(0)
  reportKey  String?
  createdBy  String
  createdAt  DateTime @default(now())
  finishedAt DateTime?
}
```

**API**
- POST /imports (multipart) → job
- GET /imports/:id, POST /imports/:id/commit, POST /imports/:id/undo

**UI**
- Import wizard with an error table and a downloadable error report.

**Acceptance criteria** (write a test for each)
- [ ] 10,000-row patient file imports in under 2 minutes without blocking the API.
- [ ] Imported patients get bookingSource/acquisition = IMPORT and never count as new Kiorex patients.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 057 is ticked in §5.

### Step 058 · ON-06 · Staff invitations by WhatsApp or email

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 014 (ON-02), Step 009 (PL-03) |
| **Branch** | `kiorly/ON-06-staff-invitations-by-whatsapp-or-email` |

**Goal.** Receptionists must be able to join in a minute, within plan seat limits.

**Current state (inspect first).** Admins can create users with passwords.

**Build**
- Invitation with role(s), expiring link, sent via WhatsApp or email; accept → set password.
- Seat check against plan entitlements before sending.
- Resend and revoke.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model Invitation { id String @id @default(cuid())  tenantId String  phoneOrEmail String  roles UserRole[]  tokenHash String  expiresAt DateTime  acceptedAt DateTime?  createdBy String }
```

**API**
- POST /invitations, POST /public/invitations/:token/accept, DELETE /invitations/:id

**UI**
- Team screen with pending invitations.

**Acceptance criteria** (write a test for each)
- [ ] Invitation beyond the seat limit returns 402 with an upgrade path.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 058 is ticked in §5.

### Step 059 · ON-07 · Field-sales assisted onboarding & rep attribution

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 013 (ON-01), Step 057 (ON-05) |
| **Branch** | `kiorly/ON-07-field-sales-assisted-onboarding-rep-attr` |

**Goal.** Most early clinics will be signed by field reps. Track who brought each clinic and let reps set clinics up on the spot.

**Current state (inspect first).** Nothing.

**Build**
- Platform role SALES_REP (or a separate rep account type) with a rep console: create tenant on behalf (owner confirms by OTP), run imports, see activation status of their clinics.
- salesRepCode stored on Subscription; rep dashboard of signups, activations, paid conversions.
- Commission-to-rep report (paid on retained clinics).

**API**
- Rep: POST /rep/tenants, GET /rep/portfolio

**UI**
- Simple mobile rep console.

**Acceptance criteria** (write a test for each)
- [ ] Owner must confirm creation by OTP; until then the tenant is PENDING_OWNER.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 059 is ticked in §5.

### Step 060 · ON-08 · First-run tour, sample data & in-app help

| | |
|---|---|
| **Workstream** | Signup, verification & onboarding |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 016 (ON-04) |
| **Branch** | `kiorly/ON-08-first-run-tour-sample-data-in-app-help` |

**Goal.** Doctors learn by doing. A safe sandbox and short Arabic videos cut support load.

**Current state (inspect first).** Guide feature and docs app exist.

**Build**
- First-run tour (5 steps) per role.
- "Try with sample patient" creates a clearly marked demo patient that is excluded from reports and billing.
- Help drawer linking to guide pages and 60-second Arabic videos.

**API**
- POST /onboarding/sample-data, DELETE /onboarding/sample-data

**UI**
- Tour + help drawer.

**Acceptance criteria** (write a test for each)
- [ ] Sample data never generates revenue, commissions or WhatsApp messages.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 060 is ticked in §5.

### Step 061 · KX-06 · Reschedule & cancellation policies (both directions)

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 042 (KX-04) |
| **Branch** | `kiorly/KX-06-reschedule-cancellation-policies-both-di` |

**Goal.** Clear rules for who can change what and when, including deposit refunds.

**Current state (inspect first).** Cancel endpoint exists for integrations.

**Build**
- Clinic policy: patient can cancel/reschedule up to X hours before; deposit refundable before Y hours; clinic-initiated cancellations always refund and notify.
- Marketplace endpoints for patient reschedule/cancel validating the policy.
- Clinic-side cancellation of a Kiorex booking requires a reason (shown to the patient).

**API**
- POST /marketplace/v1/bookings/:ref/reschedule
- POST /marketplace/v1/bookings/:ref/cancel

**UI**
- Policy settings in the Kiorex tab.

**Acceptance criteria** (write a test for each)
- [ ] Policies enforced server-side; reasons audited.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 061 is ticked in §5.

### Step 062 · KX-08 · Verified reviews after completed visits

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 043 (KX-05) |
| **Branch** | `kiorly/KX-08-verified-reviews-after-completed-visits` |

**Goal.** Only patients who actually visited can review. This is a core trust advantage.

**Current state (inspect first).** SatisfactionSurveyResponse table exists, unused.

**Build**
- On COMPLETED, emit an event; Kiorex sends the review invitation (single source of reviews in Kiorex).
- Sync aggregate rating back to Kiorly (doctor score in reports).
- Clinic can reply to reviews from Kiorly; moderation flags (abuse, PHI) handled by Kiorex.
- Retire or repurpose SatisfactionSurveyResponse to store the synced score.

**API**
- POST /marketplace/v1/reviews/aggregate (Kiorex → Kiorly)

**UI**
- Ratings card in the Kiorex tab and reports.

**Acceptance criteria** (write a test for each)
- [ ] No review invitation for no-shows or cancelled bookings.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 062 is ticked in §5.

### Step 063 · KX-09 · Clinic-branded booking page & link (commission-free)

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 041 (KX-03), Step 042 (KX-04) |
| **Branch** | `kiorly/KX-09-clinic-branded-booking-page-link-commiss` |

**Goal.** Every clinic gets its own booking page to share on WhatsApp, Instagram and Google Maps. Bookings there are free, and the page brings patients into Kiorex accounts.

**Current state (inspect first).** Nothing.

**Build**
- Slug per clinic and per doctor (kiorly.link/dr-ahmed or kiorex.com/c/…); custom domain later.
- Page renders the Kiorex booking widget with clinic branding (logo, colours from invoice settings).
- bookingSource = CLINIC_LINK (never charged).
- QR poster generator (A4 and A5, AR/EN) and a "Book on Google" setup guide.

**API**
- GET /public/booking-pages/:slug
- Reuses marketplace slots/holds/bookings with channel CLINIC_LINK

**UI**
- Kiorex tab → "Your booking link" with copy, QR and share buttons.

**Acceptance criteria** (write a test for each)
- [ ] Bookings via the link never create commission charges (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 063 is ticked in §5.

### Step 064 · KX-10 · Kiorex tab inside Kiorly (settings + performance)

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 039 (KX-01), Step 050 (CR-07) |
| **Branch** | `kiorly/KX-10-kiorex-tab-inside-kiorly-settings-perfor` |

**Goal.** One place for the clinic to control and see the value of Kiorex.

**Current state (inspect first).** Nothing.

**Build**
- Listing toggles per doctor; bookable appointment types; daily caps; min notice; booking horizon; auto vs manual confirm; deposit rules; cancellation policy.
- Profile editor (KX-02) and verification status (ON-03).
- Performance: profile views, bookings, attended, no-shows, new patients, commission, credit offset, "free" progress (CR-07), rating.

**API**
- GET /kiorex/overview?period=
- PUT /kiorex/settings

**UI**
- Bilingual tab with charts.

**Acceptance criteria** (write a test for each)
- [ ] All numbers reconcile with charges and appointments for the period.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 064 is ticked in §5.

### Step 065 · CL-03 · Prescription print & WhatsApp share with verification QR

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 005 (CL-01), Step 018 (MS-01) |
| **Branch** | `kiorly/CL-03-prescription-print-whatsapp-share-with-v` |

**Goal.** The prescription is what patients carry to the pharmacy. Make it clear, verifiable and shareable.

**Current state (inspect first).** Prescription printing with clinic logo/header exists.

**Build**
- Print brand + ingredient + Arabic instructions.
- QR code linking to a verification page (doctor, clinic, date, items) with a short-lived token.
- Send PDF to the patient on WhatsApp after sign-off (template).

**API**
- GET /public/rx/verify/:token

**UI**
- "Send to patient" button.

**Acceptance criteria** (write a test for each)
- [ ] Verification page shows no more PHI than the printed Rx.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 065 is ticked in §5.

### Step 066 · CL-04 · Specialty template coverage for launch specialties

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/CL-04-specialty-template-coverage-for-launch-s` |

**Goal.** Doctors judge a system in the first visit. The templates for their specialty must feel native.

**Current state (inspect first).** clinical-default-form-templates.ts, ClinicalFormTemplate (owner, versioned), ClinicalSpecialty enum.

**Build**
- Review and complete templates for: dermatology, pediatrics (growth charts), OB/GYN (LMP/EDD), orthopedics, ENT, internal medicine, cardiology, psychiatry, ophthalmology, urology, dentistry basics.
- Advisory board sign-off per template (CMO-led).
- Default appointment types and fees per specialty used by signup (ON-01).

**API**
- None new.

**UI**
- Template picker by specialty.

**Acceptance criteria** (write a test for each)
- [ ] Each launch specialty has ≥ 1 reviewed template and default appointment types.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 066 is ticked in §5.

### Step 067 · CL-05 · Doctor sign-off, amendments & auto-lock

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Exists |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/CL-05-doctor-sign-off-amendments-auto-lock` |

**Goal.** Medico-legal integrity of notes.

**Current state (inspect first).** Encounter signedBy/amendedBy relations, encounterAutoLockHours (72).

**Build**
- Verify: sign-off flow on mobile, amendment trail visible, lock enforcement in API tests.

**API**
- Existing.

**UI**
- Existing.

**Acceptance criteria** (write a test for each)
- [ ] A locked encounter cannot be edited via any endpoint (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 067 is ticked in §5.

### Step 068 · FS-02 · Golden-flow front desk review on tablet & phone

| | |
|---|---|
| **Workstream** | Front desk & scheduling |
| **Priority** | Blocker (before closed pilot) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FS-02-golden-flow-front-desk-review-on-tablet` |

**Goal.** Book → check-in → visit → Rx → pay → cash close → statement must be fast and error-free for receptionists.

**Current state (inspect first).** Check-in, queue tickets, rooms, draft encounters, revert, call-center restrictions (latest commit).

**Build**
- Walk the flow on a 10" tablet and a phone; fix friction (taps per check-in ≤ 4).
- Keyboard shortcuts for desktop receptionists.
- Clear error states for transfer reference validation.

**API**
- None new.

**UI**
- UX fixes.

**Acceptance criteria** (write a test for each)
- [ ] Timed test: check-in with InstaPay in < 30 s by a trained receptionist.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 068 is ticked in §5.

### Step 069 · FS-03 · Waitlist auto-fill on cancellations

| | |
|---|---|
| **Workstream** | Front desk & scheduling |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 019 (MS-02) |
| **Branch** | `kiorly/FS-03-waitlist-auto-fill-on-cancellations` |

**Goal.** Every filled cancellation is revenue saved.

**Current state (inspect first).** AppointmentWaitlistEntry + endpoints.

**Build**
- On cancellation, offer the slot via WhatsApp to waitlisted patients in order; first to accept (button) gets it; hold 15 min per offer.

**API**
- Internal job + inbound reply handling.

**UI**
- Waitlist shows offers sent and status.

**Acceptance criteria** (write a test for each)
- [ ] Never offers the same slot to two people at once.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 069 is ticked in §5.

### Step 070 · FS-05 · Show no-show risk in the UI with an honest label

| | |
|---|---|
| **Workstream** | Front desk & scheduling |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/FS-05-show-no-show-risk-in-the-ui-with-an-hone` |

**Goal.** The score exists but isn't visible; it's a formula, not a model.

**Current state (inspect first).** Appointment.noShowRiskScore, refresh endpoint.

**Build**
- Chip on appointment cards (low/medium/high) with tooltip "rule-based estimate".
- Nightly refresh job; suggest deposit or extra reminder for high risk.

**API**
- Existing.

**UI**
- Risk chip.

**Acceptance criteria** (write a test for each)
- [ ] Label says rule-based until a trained model ships.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 070 is ticked in §5.

### Step 071 · MN-01 · Refunds, credit notes, deposits & prepaid packages (APIs + UI)

| | |
|---|---|
| **Workstream** | Clinic billing & finance |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/MN-01-refunds-credit-notes-deposits-prepaid-pa` |

**Goal.** Dental, derm and physio clinics live on packages and deposits; refunds must reverse revenue and cash cleanly.

**Current state (inspect first).** CreditNote and PatientServicePackage tables; no APIs.

**Build**
- Refund/credit note against a payment or invoice, with reason and approval above a threshold; revenue reversed through the void flow.
- Packages: sell (N sessions), consume per visit, expiry, balance on patient profile.
- Deposits as liabilities until applied.

**API**
- POST /billing/refunds
- POST /billing/packages, POST /billing/packages/:id/consume
- GET /patients/:id/balances

**UI**
- Refund dialog; packages tab on patient.

**Acceptance criteria** (write a test for each)
- [ ] Every refund creates exactly one revenue reversal and one cash movement (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 071 is ticked in §5.

### Step 072 · KX-07 · Kiorex deposits & prepayments into clinic billing

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro, Clinic, Ent. |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 042 (KX-04), Step 071 (MN-01) |
| **Branch** | `kiorly/KX-07-kiorex-deposits-prepayments-into-clinic` |

**Goal.** Deposits cut no-shows. Money collected on Kiorex must show up correctly in the clinic's cash, revenue and statements.

**Current state (inspect first).** BillingPayment with allocations; one revenue path for every payment (postRevenue after FD-02); transfer channels.

**Build**
- Add payment source KIOREX_PAY (market payment method + TenantPaymentChannel).
- On booking with deposit: record a pending deposit linked to the appointment; on check-in it becomes a BillingPayment through postRevenue.
- Refunds per policy reverse the payment through the refund flow (MN-01).
- Payout reconciliation report: deposits collected by Kiorex vs payouts received by the clinic.

**API**
- POST /marketplace/v1/bookings/:ref/deposit-paid
- GET /billing/kiorex-payouts

**UI**
- Deposit badge on the appointment; payouts report.

**Acceptance criteria** (write a test for each)
- [ ] No deposit ever posts revenue outside postRevenue (the single-path CI test still passes).
- [ ] A refunded deposit reverses revenue and cash correctly.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 072 is ticked in §5.

### Step 073 · FS-04 · Deposits & payment links for high-risk bookings

| | |
|---|---|
| **Workstream** | Front desk & scheduling |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 030 (SB-02), Step 071 (MN-01) |
| **Branch** | `kiorly/FS-04-deposits-payment-links-for-high-risk-boo` |

**Goal.** Deposits are the strongest no-show lever.

**Current state (inspect first).** Patient.requiresAppointmentDeposit flag.

**Build**
- Rules: deposit required if patient flag, no-show count ≥ N, risk score ≥ X, or type.depositAmount.
- Payment link (clinic-side gateway or Kiorex Pay) sent on WhatsApp; unpaid after X hours → auto-cancel (config).
- Deposit applied at check-in through postRevenue.

**API**
- POST /appointments/:id/deposit-link

**UI**
- Deposit status chip.

**Acceptance criteria** (write a test for each)
- [ ] Forfeit and refund follow the clinic policy, with revenue reversed when refunded.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 073 is ticked in §5.

### Step 074 · MN-02 · Doctor revenue-share engine & statements

| | |
|---|---|
| **Workstream** | Clinic billing & finance |
| **Priority** | Launch (before public launch) |
| **Tiers** | Clinic, Ent. (Pro single doctor) |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/MN-02-doctor-revenue-share-engine-statements` |

**Goal.** Shared clinics pay doctors a percentage, fixed amount or room rental. This is a top reason Egyptian clinics switch.

**Current state (inspect first).** CommissionRule table (percent, fixed, roomRental, by clinician/service); unused in code.

**Build**
- Engine computing per doctor per period from collected revenue (not billed), by service and payer, with rule priority.
- Statement: visits, collections, doctor share, clinic share, room rental, adjustments, payouts recorded.
- Owner approval and lock of a statement; PDF bilingual.

**Data model** (adapt names to existing conventions; create a named migration)
```prisma
model DoctorStatement {
  id          String   @id @default(cuid())
  tenantId    String
  clinicianId String
  periodKey   String
  totalsJson  Json
  status      String   @default("DRAFT") // DRAFT APPROVED PAID
  approvedBy  String?
  paidAt      DateTime?
  @@unique([tenantId, clinicianId, periodKey])
}
```

**API**
- GET /revenue-share/statements?period=
- POST /revenue-share/statements/:id/approve
- POST /revenue-share/statements/:id/mark-paid

**UI**
- Statements screen; doctor sees their own.

**Acceptance criteria** (write a test for each)
- [ ] Totals reconcile with revenue entries for the period.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 074 is ticked in §5.

### Step 075 · MN-03 · Cash drawer & shift close UI hardening

| | |
|---|---|
| **Workstream** | Clinic billing & finance |
| **Priority** | Launch (before public launch) |
| **Tiers** | Clinic+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/MN-03-cash-drawer-shift-close-ui-hardening` |

**Goal.** Owners want to know cash is right every evening.

**Current state (inspect first).** POST /billing/cash-close, billing-cash-close test.

**Build**
- Open shift with float; blind count at close; variance requires a note; owner gets a WhatsApp summary; Z-report print (thermal + A4).

**API**
- POST /billing/shifts/open, POST /billing/shifts/:id/close

**UI**
- Shift screen.

**Acceptance criteria** (write a test for each)
- [ ] Variance over threshold flags the shift for review.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 075 is ticked in §5.

### Step 076 · MN-06 · Split payments & installments UX

| | |
|---|---|
| **Workstream** | Clinic billing & finance |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/MN-06-split-payments-installments-ux` |

**Goal.** Mixed cash + card + InstaPay is daily reality.

**Current state (inspect first).** POST /billing/payments with allocations; OperationInstallment.

**Build**
- Front-desk split payment UI; installment schedule screen with reminders.

**API**
- Existing.

**UI**
- Split dialog.

**Acceptance criteria** (write a test for each)
- [ ] Each allocation posts revenue through postRevenue.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 076 is ticked in §5.

### Step 077 · MS-04 · Doctor and owner digests

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Launch (before public launch) |
| **Tiers** | All (owner digest Pro+) |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 018 (MS-01) |
| **Branch** | `kiorly/MS-04-doctor-and-owner-digests` |

**Goal.** Daily value delivered on WhatsApp keeps Kiorly top of mind.

**Current state (inspect first).** Nothing.

**Build**
- Doctor: tomorrow's list at 20:00 local.
- Owner: daily cash summary after shift close; weekly insights (visits, revenue, no-shows, Kiorex patients, free progress).

**API**
- Scheduler jobs.

**UI**
- Digest preferences in profile.

**Acceptance criteria** (write a test for each)
- [ ] Digests respect quiet hours and opt-out.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 077 is ticked in §5.

### Step 078 · MS-05 · Transactional email (trial, invoices, security)

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/MS-05-transactional-email-trial-invoices-secur` |

**Goal.** Invoices, password resets and trial notices need email too.

**Current state (inspect first).** No email provider.

**Build**
- Email provider (e.g. AWS SES) with bilingual templates; bounce handling.

**API**
- Internal EmailService.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] DKIM/SPF/DMARC configured for the sending domain.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 078 is ticked in §5.

### Step 079 · AI-02 · AI scribe with Egyptian Arabic speech-to-text

| | |
|---|---|
| **Workstream** | AI features |
| **Priority** | Launch (before public launch) |
| **Tiers** | Add-on |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 047 (AI-01), Step 017 (PL-05) |
| **Branch** | `kiorly/AI-02-ai-scribe-with-egyptian-arabic-speech-to` |

**Goal.** The flagship demo. Today the scribe has no speech provider.

**Current state (inspect first).** AiScribeSession, start/approve endpoints; transcript empty with a note to wire STT.

**Build**
- Browser capture (MediaRecorder), chunked upload, streaming STT with Arabic/English code-switching.
- LLM fills the encounter template fields and Rx suggestions; the doctor reviews field by field and signs.
- Patient consent prompt before recording; audio deleted after sign-off (config retention).
- Meter minutes per tenant.

**API**
- POST /clinic-ai/scribe/:id/audio (chunks)
- GET /clinic-ai/scribe/:id (draft)

**UI**
- Record button in the encounter with live transcript and a review panel.

**Acceptance criteria** (write a test for each)
- [ ] A 10-minute mixed-language consultation produces a usable draft in < 60 s after stop (pilot benchmark).
- [ ] No audio persists after sign-off unless the clinic opts in.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 079 is ticked in §5.

### Step 080 · AI-04 · Gate the role assistant and clinic AI by plan

| | |
|---|---|
| **Workstream** | AI features |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 009 (PL-03) |
| **Branch** | `kiorly/AI-04-gate-the-role-assistant-and-clinic-ai-by` |

**Goal.** AI has per-use cost; keep it in paid tiers or add-ons.

**Current state (inspect first).** ai_assistant flag in three layers.

**Build**
- Map ai_assistant to Pro+ entitlement with a monthly request quota; scribe as an add-on entitlement.

**API**
- Existing.

**UI**
- Upgrade hint on Lite.

**Acceptance criteria** (write a test for each)
- [ ] Lite users see the assistant locked with a clear upgrade path.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 080 is ticked in §5.

### Step 081 · RP-01 · Operational KPIs: no-show rate, utilisation, revenue per doctor-hour, sources

| | |
|---|---|
| **Workstream** | Reports & insights |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 027 (CR-02) |
| **Branch** | `kiorly/RP-01-operational-kpis-no-show-rate-utilisatio` |

**Goal.** Owners buy control. These are the numbers they ask for.

**Current state (inspect first).** Today dashboard, period KPIs, P&L, clinic breakdown.

**Build**
- No-show rate by doctor/type/day; utilisation = booked minutes / available minutes; revenue per doctor-hour; new vs returning; booking source mix including Kiorex.

**API**
- GET /reports/operations?period=

**UI**
- Operations report page.

**Acceptance criteria** (write a test for each)
- [ ] Numbers reconcile with raw appointment data in tests.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 081 is ticked in §5.

### Step 082 · RP-02 · Excel/PDF exports & scheduled reports

| | |
|---|---|
| **Workstream** | Reports & insights |
| **Priority** | Launch (before public launch) |
| **Tiers** | Pro+ |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/RP-02-excel-pdf-exports-scheduled-reports` |

**Goal.** Accountants and owners want files.

**Current state (inspect first).** Planned (PRD N.1).

**Build**
- Server-side export (xlsx + PDF) for every report and list; scheduled weekly email/WhatsApp to the owner.
- Payments export (date, patient, service, amount, method, reference) in a simple format clinics can hand to their own ETA system or accountant.

**API**
- GET /reports/:key/export?format=xlsx|pdf

**UI**
- Export buttons.

**Acceptance criteria** (write a test for each)
- [ ] Exports respect money visibility overrides and RBAC.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 082 is ticked in §5.

### Step 083 · RP-03 · Kiorex impact report

| | |
|---|---|
| **Workstream** | Reports & insights |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 064 (KX-10), Step 032 (CR-06) |
| **Branch** | `kiorly/RP-03-kiorex-impact-report` |

**Goal.** Shows the value Kiorex delivers: new patients, revenue from them, commission, credit offsets.

**Current state (inspect first).** Nothing.

**Build**
- Per period: Kiorex bookings, attended, new patients, their visit revenue, commission, offset, net cost per new patient.

**API**
- GET /reports/kiorex?period=

**UI**
- Report page + monthly WhatsApp recap.

**Acceptance criteria** (write a test for each)
- [ ] Matches the statement (CR-11).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 083 is ticked in §5.

### Step 084 · SC-04 · MFA policy for owners, admins and finance in every environment

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 002 (FD-01) |
| **Branch** | `kiorly/SC-04-mfa-policy-for-owners-admins-and-finance` |

**Goal.** Owners control money and patient data.

**Current state (inspect first).** TOTP MFA; privileged enforcement only on AWS production.

**Build**
- Enforce MFA for owner/admin/finance in all production-like envs; WhatsApp OTP as a second factor option for doctors.

**API**
- Existing + OTP.

**UI**
- MFA setup in onboarding for owners.

**Acceptance criteria** (write a test for each)
- [ ] Owner cannot access billing without MFA after day 7.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 084 is ticked in §5.

### Step 085 · SC-05 · Tenant data export & offboarding

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/SC-05-tenant-data-export-offboarding` |

**Goal.** Clinics own their records. Export builds trust and is needed when they leave or are suspended.

**Current state (inspect first).** Nothing.

**Build**
- Owner-requested full export (ZIP: CSVs + PDFs of encounters, Rx, invoices, documents) as a background job with an expiring link.
- Patient-level export for data subject requests.
- Offboarding: cancellation → retention period → deletion with notices; legal hold option.

**API**
- POST /exports/tenant, GET /exports/:id

**UI**
- Data & privacy page.

**Acceptance criteria** (write a test for each)
- [ ] Export works in SUSPENDED state.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 085 is ticked in §5.

### Step 086 · SC-06 · Rate limiting, WAF, secrets hygiene & penetration test

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/SC-06-rate-limiting-waf-secrets-hygiene-penetr` |

**Goal.** Public signup and marketplace endpoints widen the attack surface.

**Current state (inspect first).** JWT, audit, Secrets Manager for providers.

**Build**
- Rate limits on public and auth routes; WAF rules; dependency scanning in CI; external pen test before public launch.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Pen-test highs fixed before Gate 2.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 086 is ticked in §5.

### Step 087 · SC-08 · Backup restore drill

| | |
|---|---|
| **Workstream** | Security, privacy & compliance |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Ops task — Cursor prepares scripts/runbook; a human runs it |
| **Depends on** | Step 004 (SC-01) |
| **Branch** | `kiorly/SC-08-backup-restore-drill` |

**Goal.** Backups only count once a restore has been proven.

**Current state (inspect first).** 35-day backups, PITR, drill documented.

**Build**
- Run the quarterly restore drill now in Frankfurt (eu-central-1); record RPO/RTO.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Drill report stored in Docs.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 087 is ticked in §5.

### Step 088 · QA-04 · Kiorex contract tests

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 039 (KX-01) |
| **Branch** | `kiorly/QA-04-kiorex-contract-tests` |

**Goal.** Two systems, one contract.

**Current state (inspect first).** apps/api/openapi exists.

**Build**
- Marketplace OpenAPI spec as source of truth; consumer-driven contract tests run in both repos.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Breaking changes fail CI.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 088 is ticked in §5.

### Step 089 · QA-07 · Load & device performance tests

| | |
|---|---|
| **Workstream** | Testing & reliability |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 041 (KX-03) |
| **Branch** | `kiorly/QA-07-load-device-performance-tests` |

**Goal.** Marketplace traffic and low-end phones.

**Current state (inspect first).** Nothing.

**Build**
- k6 load tests on slots and bookings; Lighthouse budget on mid-range Android (TTI < 4 s on 4G).

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Slots p95 < 150 ms at 50 rps.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 089 is ticked in §5.

### Step 090 · UX-01 · Installable PWA with push and offline "today" view

| | |
|---|---|
| **Workstream** | Apps & UX |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/UX-01-installable-pwa-with-push-and-offline-to` |

**Goal.** Doctors live on phones; app-store apps can come later.

**Current state (inspect first).** No manifest or service worker.

**Build**
- Web manifest (Kiorly logo, AR/EN names), service worker (vite-plugin-pwa), offline cache of today's schedule and patient list (read-only), web push for new Kiorex bookings.

**API**
- POST /push/subscriptions

**UI**
- Install prompt after activation.

**Acceptance criteria** (write a test for each)
- [ ] Installable on Android Chrome and iOS Safari; offline today view works in airplane mode.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 090 is ticked in §5.

### Step 091 · UX-02 · Mobile-first doctor views

| | |
|---|---|
| **Workstream** | Apps & UX |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/UX-02-mobile-first-doctor-views` |

**Goal.** Lite doctors run everything from a phone.

**Current state (inspect first).** Responsive e2e test exists.

**Build**
- Phone layouts for Today, patient header, encounter, Rx, scribe, Kiorex tab; bottom nav.

**API**
- None.

**UI**
- As listed.

**Acceptance criteria** (write a test for each)
- [ ] All Lite tasks completable on a 360 px screen.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 091 is ticked in §5.

### Step 092 · UX-03 · Arabic RTL & Egyptian copy QA

| | |
|---|---|
| **Workstream** | Apps & UX |
| **Priority** | Launch (before public launch) |
| **Tiers** | All |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/UX-03-arabic-rtl-egyptian-copy-qa` |

**Goal.** Arabic-first is a selling point only if it reads naturally.

**Current state (inspect first).** ar.json ≈ en.json (~2,000 keys).

**Build**
- Native review of all strings; Egyptian-friendly wording for patient-facing messages; RTL visual QA on every screen; Arabic numerals option.

**API**
- None.

**UI**
- Copy fixes.

**Acceptance criteria** (write a test for each)
- [ ] Missing-key check in CI; zero untranslated strings in AR.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 092 is ticked in §5.

### Step 093 · PA-01 · Tenant lifecycle console

| | |
|---|---|
| **Workstream** | Platform admin console |
| **Priority** | Launch (before public launch) |
| **Tiers** | Platform |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 008 (PL-02), Step 012 (CR-05), Step 029 (SB-01) |
| **Branch** | `kiorly/PA-01-tenant-lifecycle-console` |

**Goal.** Ops needs one screen per clinic: plan, trial, wallet, invoices, listing, verification, health.

**Current state (inspect first).** Platform admin with markets, insights, tenants, feature flags, payment channels, integration failures.

**Build**
- Tenant page: subscription + events, trial actions (extend), wallet and grants, invoices and payments, entitlement overrides, Kiorex listings, verification, activation score, notes, rep.

**API**
- /admin/platform/tenants/:id/*

**UI**
- Tabbed tenant console.

**Acceptance criteria** (write a test for each)
- [ ] Every action is audited and permission-checked (platform roles).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 093 is ticked in §5.

### Step 094 · PA-04 · Support access with consent & audit

| | |
|---|---|
| **Workstream** | Platform admin console |
| **Priority** | Launch (before public launch) |
| **Tiers** | Platform |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/PA-04-support-access-with-consent-audit` |

**Goal.** Support must help clinics without uncontrolled access to patient data.

**Current state (inspect first).** support module, support-access.ts.

**Build**
- Time-boxed, owner-approved support sessions; every read logged; PHI masked by default.

**API**
- POST /support/access-requests

**UI**
- Owner approval prompt.

**Acceptance criteria** (write a test for each)
- [ ] Support cannot open a patient chart without an active approved session.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 094 is ticked in §5.

### Step 095 · PA-05 · Growth analytics: activation funnel & cohorts

| | |
|---|---|
| **Workstream** | Platform admin console |
| **Priority** | Launch (before public launch) |
| **Tiers** | Platform |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 016 (ON-04) |
| **Branch** | `kiorly/PA-05-growth-analytics-activation-funnel-cohor` |

**Goal.** You will manage the launch by these numbers.

**Current state (inspect first).** Platform insights exist.

**Build**
- Funnel: signup → onboarding steps → activated → trial end → paid; cohort retention; MRR/ARR; Kiorex attach rate; paywall conversions; by rep and source.

**API**
- GET /admin/platform/growth

**UI**
- Growth dashboard.

**Acceptance criteria** (write a test for each)
- [ ] Numbers reproducible from event tables.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 095 is ticked in §5.

### Step 096 · GT-01 · Marketing website & pricing page with "Kiorly free" calculator

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Launch (before public launch) |
| **Tiers** | — |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 007 (PL-01), Step 028 (CR-04) |
| **Branch** | `kiorly/GT-01-marketing-website-pricing-page-with-kior` |

**Goal.** Self-serve and field sales both need a public home with clear pricing.

**Current state (inspect first).** Nothing.

**Build**
- AR/EN site: product, specialties, pricing (from GET /public/plans), calculator "how many Kiorex patients make Kiorly free", founding counter (PL-09), signup CTA, demo booking.

**API**
- Public endpoints.

**UI**
- Site.

**Acceptance criteria** (write a test for each)
- [ ] Pricing on the site always equals the API values.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 096 is ticked in §5.

### Step 097 · GT-03 · Help centre & Arabic video tutorials

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Launch (before public launch) |
| **Tiers** | — |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | None |
| **Branch** | `kiorly/GT-03-help-centre-arabic-video-tutorials` |

**Goal.** Self-serve requires self-help.

**Current state (inspect first).** apps/docs and Documentation_Portal.md.

**Build**
- Task-based articles per tier; 60-second Arabic videos for the golden flow; search.

**API**
- None.

**UI**
- Help drawer links (ON-08).

**Acceptance criteria** (write a test for each)
- [ ] Top 20 support questions answered by articles.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 097 is ticked in §5.

### Step 098 · GT-04 · Support operations & WhatsApp support line

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Launch (before public launch) |
| **Tiers** | — |
| **Status in repo** | Partial |
| **Type** | Code + human input — Cursor builds the code; the listed business/legal/content items need a human |
| **Depends on** | Step 018 (MS-01) |
| **Branch** | `kiorly/GT-04-support-operations-whatsapp-support-line` |

**Goal.** Fast human help converts trials.

**Current state (inspect first).** Support tickets module; hours Sun–Thu 09:00–18:00, P1 4h.

**Build**
- WhatsApp support number connected to the ticket module; macros; escalation to engineering.

**API**
- Existing + webhook.

**UI**
- Support inbox.

**Acceptance criteria** (write a test for each)
- [ ] First response SLA measured.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 098 is ticked in §5.

### Step 099 · GT-05 · Sales kit: demo tenants, ROI calculator, referral & rep codes

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Launch (before public launch) |
| **Tiers** | — |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 011 (QA-06), Step 059 (ON-07), Step 053 (CR-09) |
| **Branch** | `kiorly/GT-05-sales-kit-demo-tenants-roi-calculator-re` |

**Goal.** Reps need a reliable demo and simple maths.

**Current state (inspect first).** Nothing.

**Build**
- Resettable demo tenants per tier; ROI calculator (no-shows, admin time, Kiorex patients); rep QR codes with salesRepCode.

**API**
- POST /admin/platform/demo/reset

**UI**
- Rep console.

**Acceptance criteria** (write a test for each)
- [ ] Demo resets in < 1 minute.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 099 is ticked in §5.

### Step 100 · GT-06 · Docs cleanup & capability map update

| | |
|---|---|
| **Workstream** | Go-to-market assets |
| **Priority** | Launch (before public launch) |
| **Tiers** | — |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/GT-06-docs-cleanup-capability-map-update` |

**Goal.** Docs should reflect the launch scope and statuses.

**Current state (inspect first).** CLINIC_PLATFORM_CAPABILITIES.md and PRODUCT_EPIC_ROADMAP.md partly out of date.

**Build**
- Add PLANS_AND_ENTITLEMENTS.md, BILLING_AND_CREDITS.md, KIOREX_CONNECTOR.md; update status rows after each task.

**API**
- None.

**UI**
- None.

**Acceptance criteria** (write a test for each)
- [ ] Every shipped task updates its doc row in the same PR.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 100 is ticked in §5.

---

## Stage F · Phase 1b

> After public launch. Steps 101–108. **Do not start Stage F until public launch.**

### Step 101 · CR-10 · No-show guarantee credits (optional, off by default)

| | |
|---|---|
| **Workstream** | Trial, credits & Kiorex commission |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Pro, Clinic |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 012 (CR-05), Step 081 (RP-01) |
| **Branch** | `kiorly/CR-10-no-show-guarantee-credits-optional-off-b` |

**Goal.** Supports the "cut no-shows 30% in 90 days or 3 months free" offer once the pilot shows the baseline.

**Current state (inspect first).** noShowAt and noShowCount exist.

**Build**
- Baseline = no-show rate in the first 30 days after activation (min 100 appointments, else not eligible).
- At day 120, compare days 31–120. If the reduction is below the target %, GRANT NO_SHOW_GUARANTEE credit of N months.
- Eligibility requires reminders and deposits to be enabled (otherwise the offer doesn't apply).

**API**
- GET /billing/guarantee

**UI**
- Guarantee tracker card when enabled.

**Acceptance criteria** (write a test for each)
- [ ] Disabled by default via market config; calculation reproducible from appointment data.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 101 is ticked in §5.

### Step 102 · KX-11 · Consent-based record sharing with the patient app

| | |
|---|---|
| **Workstream** | Kiorex marketplace connector |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Pro+ |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 023 (SC-03), Step 043 (KX-05) |
| **Branch** | `kiorly/KX-11-consent-based-record-sharing-with-the-pa` |

**Goal.** Patients see their visit summary and prescriptions in Kiorex; later, the longitudinal record.

**Current state (inspect first).** PatientDataProtectionConsent exists.

**Build**
- Consent scopes per patient: VISIT_SUMMARY, PRESCRIPTIONS, LAB_RESULTS, SHARE_WITH_OTHER_CLINICS.
- Push signed visit summary and Rx PDF to Kiorex after sign-off when consented.
- Revocation stops future sharing and requests deletion in Kiorex.

**API**
- POST /marketplace/v1/patients/:id/consents
- Events VISIT_SUMMARY_SHARED

**UI**
- Consent toggles in the patient profile.

**Acceptance criteria** (write a test for each)
- [ ] Nothing is shared without an active consent for that scope (test).

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 102 is ticked in §5.

### Step 103 · CL-06 · Lab & radiology orders as records

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Pro+ |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/CL-06-lab-radiology-orders-as-records` |

**Goal.** Orders tie into lab partners on Kiorex later.

**Current state (inspect first).** Results only as uploaded documents.

**Build**
- LabOrder / ImagingOrder with items, status, results (structured + PDF), patient notification.

**API**
- CRUD /clinical/orders

**UI**
- Orders panel in the encounter.

**Acceptance criteria** (write a test for each)
- [ ] Results ready → WhatsApp template "results ready".

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 103 is ticked in §5.

### Step 104 · CL-07 · Specialty packs: dental chart, aesthetics before/after, physio plans

| | |
|---|---|
| **Workstream** | Clinical core |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/CL-07-specialty-packs-dental-chart-aesthetics` |

**Goal.** Unlocks dental and aesthetics clinics (Dentolize territory).

**Current state (inspect first).** DENTISTRY/AESTHETICS specialties, PatientClinicalPhoto, consent upload for operations.

**Build**
- Odontogram with treatment plan and per-tooth billing; before/after photo comparison with consent; physio session series using AppointmentSeries.

**API**
- Per pack.

**UI**
- Per pack.

**Acceptance criteria** (write a test for each)
- [ ] Pack entitlements (pack_dental, pack_aesthetics) can be sold as add-ons.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 104 is ticked in §5.

### Step 105 · MN-05 · Company contracts & TPA claims

| | |
|---|---|
| **Workstream** | Clinic billing & finance |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Clinic, Ent. |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 071 (MN-01) |
| **Branch** | `kiorly/MN-05-company-contracts-tpa-claims` |

**Goal.** Corporate and insured patients are a large share of visits in many clinics.

**Current state (inspect first).** PayerCompany, ContractServicePrice, PayerPreAuthorization, co-pay %.

**Build**
- Claim batches per payer/period, claim lines from invoices, statuses, rejections with reasons, resubmission, remittance matching, B2B e-invoice to the payer.

**API**
- /claims/*

**UI**
- Claims workspace.

**Acceptance criteria** (write a test for each)
- [ ] Remittance import matches ≥ 90% of lines automatically in test data.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 105 is ticked in §5.

### Step 106 · MS-06 · WhatsApp AI receptionist (Egyptian Arabic)

| | |
|---|---|
| **Workstream** | WhatsApp & notifications |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Add-on |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 019 (MS-02), Step 041 (KX-03), Step 047 (AI-01) |
| **Branch** | `kiorly/MS-06-whatsapp-ai-receptionist-egyptian-arabic` |

**Goal.** 24/7 booking in the patient's dialect.

**Current state (inspect first).** Role assistant exists (different purpose).

**Build**
- Intent handling for booking, rescheduling, prices, location and hours using SlotService; handover to staff.

**API**
- Inside the WhatsApp webhook.

**UI**
- Conversation inbox.

**Acceptance criteria** (write a test for each)
- [ ] Never gives medical advice; hands over on clinical questions.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 106 is ticked in §5.

### Step 107 · RP-04 · AR aging, payouts and branch P&L

| | |
|---|---|
| **Workstream** | Reports & insights |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Clinic+ |
| **Status in repo** | Missing |
| **Type** | Code — Cursor implements fully |
| **Depends on** | Step 105 (MN-05) |
| **Branch** | `kiorly/RP-04-ar-aging-payouts-and-branch-p-l` |

**Goal.** Needed once payers and multiple branches are active.

**Current state (inspect first).** Planned.

**Build**
- Aging buckets per payer; payout tracking; branch P&L.

**API**
- /reports/ar-aging, /reports/branch-pl

**UI**
- Pages.

**Acceptance criteria** (write a test for each)
- [ ] Totals reconcile with billing tables.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 107 is ticked in §5.

### Step 108 · UX-04 · Thermal printing & accessibility

| | |
|---|---|
| **Workstream** | Apps & UX |
| **Priority** | Post-launch (Phase 1b) |
| **Tiers** | Pro+ |
| **Status in repo** | Partial |
| **Type** | Code — Cursor implements fully |
| **Depends on** | None |
| **Branch** | `kiorly/UX-04-thermal-printing-accessibility` |

**Goal.** Receipts and queue tickets on 80 mm printers; readable UI.

**Current state (inspect first).** A4 bilingual print for invoices and Rx; thermal planned.

**Build**
- 80 mm templates for receipts, tickets, Z-report; WCAG AA contrast and focus states.

**API**
- None.

**UI**
- Print settings.

**Acceptance criteria** (write a test for each)
- [ ] Prints correctly on two common thermal printers.

**Done when:** all acceptance tests pass, §0.2 checks are green, en + ar strings added, docs updated, and Step 108 is ticked in §5.

---

*End of build sequence. After Step 108, report completion of all stages to the human.*
