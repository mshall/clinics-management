# CL-07 — Specialty packs (dental, aesthetics, physio)

Paid add-ons (off on all base plans):

| Entitlement | Features |
|--------------|----------|
| `pack_dental` | Odontogram `DentalChartTooth` + treatment notes / per-tooth fee |
| `pack_aesthetics` | Before/after photo pairs (`ClinicalPhotoKind` BEFORE/AFTER + `pairGroupId`) |
| `pack_physio` | Physio session series via `AppointmentSeries` |

## Purchase

`GET /billing/addons` · `POST /billing/addons/purchase` `{ entitlementKey }` → tenant entitlement override `true` (audited). Same catalog listed at `GET /clinical/specialty-packs/addons`.

## Clinical API

- `GET/PUT /clinical/patients/:id/dental-chart` (`@RequiresEntitlement("pack_dental")`)
- `GET /clinical/patients/:id/before-after` (`pack_aesthetics`)
- `POST /clinical/physio-plans` (`pack_physio`)

## Migration

`20261119250000_cl07_specialty_packs`


## Physiotherapy pack (Rev 2.3, KX-05 §07: CL07-PT01..05)

Add-on `pack_physio`: **EGP 300 / org / month, PROPOSED and NEEDS_HUMAN** (pricing owner confirms; nothing bills it automatically). Add-on on Lite / Pro / Clinic, included in Enterprise.
The built-in physio template is launch-locked behind `clinic.specialty_templates.physio` (**gate GPR2, human: specialty board with a physiotherapist reviewer; never recorded by code**, `PHYSIO_TEMPLATE_REVIEW.boardSignOff` stays `null`). New physio actions are refused (403 `FEATURE_DISABLED`) only when a Kiorex snapshot marks the flag gate-unsatisfied or OFF; reading existing records is never blocked. Writes need the `encounter.template.physio` / `sessions.record` scope (PRSOP).

| ID | Implementation |
|----|----------------|
| PT01 initial assessment | `POST /clinical/physio/assessments` (complaint, history, pain 0-10, ROM per joint, strength MRC 0-5, special tests, functional goals; baseline outcome points); template `PHYSIO_THERAPY` v3 fields |
| PT02 treatment plan + package counter | `POST /clinical/physio/plans` (sessions, frequency, modalities, home programme, optional MN01 `packageId`); `sessionsCompleted/sessionsRemaining` |
| PT03 progress note, trend, discharge | `POST /plans/:id/progress-notes`, `GET /patients/:id/outcome-trend?kind&label`, `POST /plans/:id/discharge` |
| PT04 referral in | `POST /referrals` (attached document) and `receiveReferral()` for `ReferralIssued` by consent (inbound route waits for the contract). Plans need a referral unless `Market.clinicalConfig.physioDirectAccess = true` (open question Q9, default off) |
| PT05 home exercise programme | `PUT /plans/:id/home-programme`, `POST .../share` -> WhatsApp template `physio_hep_link` (variables `clinic`, `link` only: no PHI), public `GET /public/physio/hep/:token` (exercises + clinic name only) |

Migrations: `20261120113000_cl07_physio_pack_expand` (6 tables, additive), `20261120113100_user_supervisor_idx_restore`.
Tests: `physio-pack.node.test.ts`, `physio.integration.test.ts`, `cl07-specialty-packs.node.test.ts`.
NEEDS_HUMAN: GPR2 sign-off, add-on price, Meta approval of `physio_hep_link` (EN + AR), Q9 direct-access rule, web UI for the pack (API only today).
