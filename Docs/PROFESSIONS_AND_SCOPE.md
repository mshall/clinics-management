# Professions, scope of practice and professional verification (PRSOP / PRVER)

KX-05 Rev 2.3 §06 · ADR-029 · hazard H17 (outside-scope action) and H11 (stale credentials).
Scope of practice and profession verification are **safety controls (ADR-025): never a feature flag.**

| ID | Status | Where |
|----|--------|-------|
| PRSOP01 `User.profession` (PHYSICIAN, DENTIST, PHYSIOTHERAPIST, NURSE; + ASSISTANT for PRSOP03), expand-contract backfill | Done (expand) | migration `20261120103000_prsop01_profession_prver_registrations_expand` |
| PRSOP02 capability matrix per market pack, versioned, CMO sign-off field; unknown capability fails CI | Done (CMO sign-off **NEEDS_HUMAN**, `cmoSignOff: null`) | `scope-of-practice/profession-pack.ts`, `scope-capabilities.ts` |
| PRSOP02 `@RequiresScope` guard → 403 `SCOPE_NOT_ALLOWED` | Done | `scope-of-practice/scope.guard.ts` |
| PRSOP03 ASSISTANT under a named supervisor, cannot sign, never listed | Done | `PATCH /clinicians/:userId/profession`, `encounter.sign` scope, listing gate |
| PRSOP04 AI scribe and assistant prompts carry the profession; drafts never suggest out-of-scope actions | Done | `scope-of-practice/profession-prompt.ts`, `clinic-ai.service.ts` (scribe), `assistant.service.ts` |
| PRVER01 verification rule per profession from the market pack (registers, number formats, documents) | Done | `profession-pack.ts` `verification`, `ProfessionalRegistration` |
| PRVER02 ops queue shows the profession's checklist; badge names the profession | Done | `/platform/verifications`, `verificationBadge()` |
| PRVER03 re-verify on name / profession / specialty change; licence-expiry reminders | Done | `reverify.ts`, `ProfessionReverificationService` (daily) |
| PRVER04 solo nurses: ID selfie + criminal-record certificate | Done as documents + checklist (the Nurse edition decides who is "solo"; `solo` is a submit flag until then) | pack `soloExtraDocuments` |

## Profession on the user

`User.profession` is nullable during the **expand** phase. Backfill (idempotent SQL in the migration): physician-role users become
`PHYSICIAN`, or `DENTIST` when their declared/verified specialty is `DENTISTRY`; legacy `NURSE`-role users become `NURSE`; verification
snapshots follow. Until the *contract* migration (NOT NULL for clinician roles, planned one release later), `effectiveProfession()` maps
NULL → PHYSICIAN (physician role) / NURSE (nurse role); every other role (admins, front desk) has **no profession and is not scope-checked**
(their existing role / nav-tab rules still apply). New physician/nurse users created through `POST /admin/tenants/:id/users` get an explicit profession.
Changing a profession (`PATCH /clinicians/:userId/profession`, organisation admins only) **forces re-verification**, drops the old registrations and writes an audit entry.

## Scope matrix (market-pack data)

Stored as `Market.clinicalConfig.professionPack` (validated by `assertMarketPackConfigured`); when absent the shipped Egypt baseline
(`EG_PROFESSION_PACK`, version `2026-11-20.1`) applies. Capabilities live in `scope-capabilities.ts`:
`practice.core`, `encounter.template.{soap,dental_chart,physio,nursing}`, `rx.prescribe`, `orders.lab_radiology`, `vitals.record`,
`outcome_measures.record`, `sessions.record`, `mar.administer`, `assistant.supervise`, `home_visits.perform`, `encounter.sign`.

CI (`scope-of-practice.node.test.ts`) fails on: a capability in any pack that is not registered; an `@RequiresScope("…")` /
`assertCan("…")` in source naming an unregistered capability; a pack missing a profession; scope code that uses flag gating.
`prsop-scope-contract.integration.test.ts` reflects over the real controllers: every Rx route (encounter medications, prescription
print/send/handoff, `rx/check`, `medications/safety-check`, operation medications / reset-clinical) is `@RequiresScope("rx.prescribe")`,
every lab/radiology order write is `orders.lab_radiology`, finalize/amend are `encounter.sign`, and physio/nurse/assistant get
**403 `{ code: "SCOPE_NOT_ALLOWED", capability, profession }`** on each (physician/dentist pass). `GET /scope-of-practice/me` gives the web the
profession and allowed capabilities (the web hides, the server enforces).

## Verification per profession (Egypt baseline)

| Profession | Registers | Required documents | Ops checklist |
|---|---|---|---|
| Physician | Medical Syndicate (+ MoH licence, optional for legacy ON-03 physicians) | syndicate card, specialty certificate | documents_readable, syndicate_card, specialty_match, national_id_present |
| Dentist | Dentists Syndicate + MoH licence | syndicate card, MoH licence | documents_readable, syndicate_card, moh_licence, national_id_present |
| Physiotherapist | Physical Therapy Syndicate + MoH physiotherapy licence | syndicate card, MoH licence | same as dentist |
| Nurse | Nursing Syndicate + MoH licence | syndicate card, MoH licence | same; **solo** adds ID selfie + criminal-record certificate and `id_selfie_match`, `criminal_record_certificate` |

Registration-number formats are a generic pattern until Ops confirm each register's real format (NEEDS_HUMAN); the criminal-record certificate
wording/retention is open question Q8 (NEEDS_HUMAN). The ID selfie is compared by the human reviewer (no biometric provider; if one is added it
goes behind a `MODE=mock|real` adapter). The badge reads "Verified physiotherapist" etc. (AR/EN) and only counts when the record was verified
**for the clinician's current profession** (`effectiveVerificationStatus`): a profession change, an ASSISTANT, or an expired record never lists on Kiorex.

## Re-verification schedule (PRVER03)

On approval `nextReverifyAt = min(approval + pack.reverification.intervalMonths (12), earliest register expiry)`. The daily
`ProfessionReverificationService` sends in-app notices to the clinician and organisation owners at 60 / 30 / 7 days (once per stage) and moves
an overdue record to `EXPIRED` (reason `LICENCE_EXPIRED` or `INTERVAL_ELAPSED`), which pauses the Kiorex listing. Name changes
(`PATCH admin user displayName`), profession changes and specialty changes send a VERIFIED record to PENDING with `reverifyReason`.

## Follow-ups (not in this change)

- Contract migration: make `User.profession` NOT NULL for clinician roles after one release (expand-contract).
- Template enforcement (`encounter.template.*`): `GET /clinical/form-templates` is filtered server-side by the clinician's profession (`ScopeOfPracticeService.filterTemplatesForUser`: DENTISTRY -> dental_chart, PHYSIO_THERAPY -> physio, everything else SOAP; users without a profession are unfiltered). Unit tests in `scope-of-practice.node.test.ts`.
- Tests: `scope-of-practice.node.test.ts`, `profession-verification.node.test.ts`, `profession-prompt.node.test.ts`, `prsop-prver.integration.test.ts`, `prsop-scope-contract.integration.test.ts`.
