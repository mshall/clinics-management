# Kiorly Nurse edition (KNED / KNSVC / KNCP / KNREC / KNMAR / KNESC / KNFAM / KNSH / KNAG / KNRPT)

KX-23 · ADR-031 (edition, not a product) · ADR-032 (solo vs agency). **One codebase, one database, one API, one Kiorex connector.** Never a `kiorly-nurse` repo.
Code: `apps/api/src/nurse/`, web mirror `apps/web/src/lib/edition.ts` + `features/edition/edition-boot.tsx`, web screens `apps/web/src/features/nurse/` (Q7), Prisma models in `schema.prisma`.

## Edition (KNED)

- `Tenant.edition` CLINIC | NURSE (default CLINIC) and `nurseTenantKind` SOLO | AGENCY. Only the **Kiorex super admin** changes it (`PUT /nurse/platform/tenants/:id/edition`, 403 `EDITION_CHANGE_FORBIDDEN` otherwise, KNED04). A clinic that employs nurses stays CLINIC.
- Sign-up (`POST /public/nurse/signup/complete`, phone OTP via the shared `/public/signup/otp|verify`): sets edition NURSE, Solo or Agency, plan `NURSE_*`, seeds the service catalogue as HOME visit types, a solo owner is a clinician with profession NURSE; an agency owner is an administrator. Gated by `nurse.edition` / `nurse.individual_tenants` (global/market, no org yet).
- Branding (KNED02): "Kiorly Nurse", **Nurse Rose `#E11D48`** accent on the unchanged Kiorly palette (`html[data-edition="nurse"]`), terminology (Clinic -> Practice/Agency, Encounter -> Visit record, Doctor -> Nurse, receptionist -> Dispatcher), seven tabs (+ Team, Dispatch for agencies). Arabic name is a placeholder (Q12, NH-037).
- Host: `nurse.kiorly.com` selects NURSE **only before sign-in**; the organization's edition always wins afterwards (a host never changes data). `GET /public/nurse/edition`, `GET /nurse/context`.
- **OIDC (Kiorex Passport):** one client, `aud = kiorly-clinic`, no edition/profession claim. The edition only picks the redirect URI (`KIOREX_OIDC_REDIRECT_URI_NURSE`, default `https://nurse.kiorly.com/auth/kiorex/callback`; `NURSE_WEB_URL` in dev). "Sign in with Kiorex Passport" is the primary action on the Nurse login (`/auth/kiorex/config` -> `defaultSignIn`). Redirect URIs for the nurse host must also be registered in kiorex-account.
- `nurse.*` flags are **edition-gated**: effective only for NURSE orgs (`source: org, scope: org` for a Clinic org even with every gate satisfied).
- Onboarding wizard status (KNED03): `GET /nurse/onboarding` (profession verification incl. PRVER04 evidence for solo, zones, services, prices, availability, safety contact).

## Plans (KX-23 §05) - PROPOSED, NEEDS_HUMAN (NH-036)

| Plan (`PlanKey`) | Proposed price (EGP) | Notes |
|---|---|---|
| Nurse Lite `NURSE_LITE` | 0 + Kiorex fees, 100 minimum invoice | visits, records, vitals, MAR, safety, Kiorex listing when allowed |
| Nurse Pro `NURSE_PRO` | 399 / nurse / month (299 annual) | + family updates, private-duty shifts, WhatsApp reminders, card/InstaPay/Fawry, reports |
| Nurse Agency `NURSE_AGENCY` | 1,999 / month incl. 10 nurses, 149 per extra | + team, dispatch, nurse pay, multi-branch |
| Enterprise | custom | |

Plans exist as non-public `Plan` rows with entitlements (`nurse_family_updates`, `nurse_private_duty_shifts`, `nurse_agency`, `home_route_view`, `home_dispatch`); **no `PlanPrice` rows**, the numbers live only in `nurse/nurse-plans.ts` and `GET /public/nurse/plans` (`priceStatus: PROPOSED`). Home-visit safety is in every plan including Lite.

## Clinical modules

| ID | What | Safety / gates |
|---|---|---|
| KNSVC01/02 | 8-service catalogue as HOME types (30/30 buffers); private-duty 8/12/24 h via shifts | editable prices (NEEDS_HUMAN for any tariff) |
| KNCP01-03 | `CarePlan` services x frequency x duration generates real home visits through the slot engine and the HV booking rules; remaining counter; pause (frees slots) / resume / extend / end with discharge note; `CARE_PLAN_CONFIRMED/_ENDED` for Kiorex plans (`requestRef`); discharge shared to the vault only with `VISIT_SUMMARY` consent | `nurse.care_plans` launch-locked (GKN1) gates NEW plans |
| KNREC01 | visit record (checklist, assessment, intervention, evaluation, free text); signing finalizes the draft encounter (visit completes, bills normally; nurses never prescribe: `noMedications`); signed = locked | scope `encounter.template.nursing` / `encounter.sign` |
| KNREC02/KNESC01 | vitals, out-of-range flags, trend; critical value shows "call the doctor / call 123" and **must have an escalation entry before signing** | thresholds = market-pack `vitalsThresholds`; shipped baseline is a CMO-unsigned placeholder (NH-034); never a flag |
| KNMAR01-03 | doctor orders (shared `MedicationOrderShared` with consent token, or photo with prescriber + date + expiry confirmed by the nurse) and the medication administration record | **no order, no administration (BR57)**; expired/revoked/other patient/medicine not on order refused; allergy + duplicate checks on every entry; controlled medicines need a controlled order + witness (BR35); **never flags** (`mar-safety.ts`, `medication-administration.service.ts` on the `mar_safety_checks` safety path). `nurse.mar` (GKN1) only decides whether the structured MAR endpoints exist (OFF = free-text medication on the visit record) |
| KNFAM01 | after a signed visit, WhatsApp template `nurse_family_update` (body = link only, no PHI) to family contacts with `FAMILY_UPDATES` consent; public summary (nurse first name, date, tasks done) behind an expiring HMAC token | `nurse.family_updates` (depends on `whatsapp_reminders`) |
| KNSH01 | shifts 8/12/24 h, geostamped check-in/out (coarse, same retention), handover note to the next nurse | `nurse.private_duty_shifts` + entitlement |
| KNAG01-04 | roster (skills, languages, zones, pay rates), dispatch (`POST /home-visits/:id/assign`) with the **dispatch guard**: only nurses VERIFIED for their current profession and in zone; aides (ASSISTANT) and unverified staff are never dispatchable; pay statements per visit/shift; cash collected at homes | stop-ship "unverified nurse assignable" is a test |
| KNKX01-03 | Kiorex: agencies list (`assignsClinician`, `HOME_VISIT_ASSIGNED`); **solo nurses list only when `nurse.individual_kiorex_listing` (GKN2) is effective AND PRVER04 evidence was checked** (otherwise `PAUSED`, software keeps working); one fee per attended first visit, care-plan follow-ups never commissionable (BR55) | NH-035 |
| KNRPT01 | `GET /nurse/reports/summary`: visits done, hours, revenue, travel time, plan completion, missed-visit rate, safety alerts | aggregates only |

## Demo tenants

`npm run db:seed:nurse -w api` (idempotent, additive, local): a solo practice (`mona@nurse-demo.kiorly.test`) and an agency (owner, dispatcher, five nurses, an aide), password `Demo@12345`. The full Rev 2.3 demo dataset (verification in every state, home visits, care plans, MAR) is `prisma/demo/seed-rev23.ts`, run by `db:seed:demo` (see `Docs/TEST_DATA.md`).


## Web screens (Q7) - `apps/web/src/features/nurse/`

Mobile-first (44 px tap targets, sticky action bars, bottom nav on phones), AR/EN with RTL, dark mode, Nurse Rose accent, loading / empty / error states everywhere, and **awaiting-gate** states: a launch-locked capability shows a "Not available yet" notice (never a broken screen); safety screens never read a flag. Nurses land on the Today route (agency office staff on Dispatch); the sidebar shows a field-first Nurse menu and the phone bottom bar is Today / Care plans / MAR / Safety / More.

| Route | Screen | Requirement IDs | Notes |
|---|---|---|---|
| `/home-visits/today` | Today route (existing) + "Visit record" link, Safety link | HVEXE01 | On my way / Arrived / Finished, SOS |
| `/nurse/care-plans`, `/nurse/care-plans/:id` | care plans: create (services x every N days x duration x time, address), list/filter, remaining counter, pause / resume / extend / end (discharge note required), share discharge (consent) | KNCP01-03 | create is disabled with the awaiting-gate notice until `nurse.care_plans` (GKN1) is effective; existing plans always readable |
| `/nurse/visits/:appointmentId` | visit record (checklist, assessment, intervention, evaluation, free text), vitals entry with out-of-range flags, **critical-value banner (call the doctor / 123, log the action; Sign stays disabled until logged)**, sign + lock, family update after signing | KNREC01/02, KNESC01 | `nurse.mar` OFF: medication is a free-text box on the record |
| `/nurse/mar`, `/nurse/mar/:patientId` | doctor orders (photo order confirmed by the nurse) and MAR; allergies on top; **blocks** (no order, other patient, revoked, expired, medicine not on order, allergy, duplicate, controlled needs a controlled order + witness) render as red "Blocked ... Nothing was recorded" panels | KNMAR01-03 | structured screens behind `nurse.mar` (GKN1); the checks themselves are server safety controls |
| `/nurse/services` | the 8-service catalogue with editable price and home surcharge; plan cards always badged **Proposed** (NEEDS_HUMAN, NH-036) | KNSVC01/02 | no price is published |
| `/nurse/dispatch` (agency) | visits (assign / reassign with suggestions), roster (verified vs aide / unverified, skills, languages, pay rates, pay statement, zones, weekly availability), shifts | KNAG01-04 | the dispatch guard is visible: aides and unverified staff are listed as "cannot be assigned" and are not selectable; the server enforces it too |
| `/nurse/shifts` | private-duty shifts (8/12/24 h): book, geostamped check-in/out, handover note | KNSH01 | `nurse.private_duty_shifts` + entitlement |
| `/nurse/safety` | check-in timer (prompt at planned end + 30 min, alert 10 min later), "I'm safe", SOS (123 / 122), unsafe-abort with category + reason (never a no-show), safety contact, alerts (ack / resolve for managers) | HVSAF01-04 | never flag-gated |
| `/nurse/inbox` | Kiorex requests: home bookings (REQUESTED / CONFIRMED from Kiorex) and **care-plan requests** (accept creates the plan with the same `requestRef`; decline answers DECLINED) | KNKX01, P3 draft | |
| `/nurse/family`, `/f/:token` | family contacts with explicit WhatsApp consent (default off); public summary page (nurse first name, date, tasks) | KNFAM01 | WhatsApp is a mock adapter (dev inbox) |
| `/nurse/reports` | visits done, hours, revenue (+ surcharge), travel, plan completion, missed-visit rate, safety alerts | KNRPT01 | aggregates only |
| `/nurse/onboarding` | steps for a **solo nurse** (licence + ID/selfie + criminal-record evidence, zones, services, prices, availability, safety contact) or an **agency** (no zones / availability steps), Kiorex listing note (individual listing paused until GKN2) | KNED03 | zones and availability are editable inline |
| `/login` | on the Nurse host, "Sign in with Kiorex Passport" is the primary action above the email / phone form | KNED, ADR-031 | the Vite dev proxy forwards `x-forwarded-host` so `nurse.localhost:5174` selects the Nurse edition |

New API for the web: `GET /nurse/care-plan-requests`, `POST /nurse/care-plan-requests/:id/accept|decline`, `GET /nurse/patients/:id/family-contacts`, `PUT /nurse/patients/:id/family-contacts/:contactId/consent`, shift names in `GET /nurse/shifts`, `patientId` in the visit record, `nurse.individual_kiorex_listing` in `GET /nurse/context` features.

## Kiorex P3 draft: `POST /marketplace/v1/care-plan-requests`

Contracts 1.5.0 shape (`CarePlanRequest` -> `CarePlanRequestAck`), HMAC client like every `/marketplace/v1` route. The clinic's LIVE/PAUSED listing resolves the tenant. **`nurse.care_plans` (GKN1) is launch-locked: 403 `FEATURE_DISABLED` until the control plane records the gate.** After that: 400 on a bad shape, 422 `CARE_PLANS_NOT_OFFERED` (not a Nurse org, or no HOME service) or `OUT_OF_COVERAGE`, idempotent on `requestRef` (a replay returns the original ack, including `DECLINED` / the `carePlanId` once accepted). The address is stored encrypted (`CarePlanRequest.visitAddressCiphertext`, HVPRV01), the inbox shows only the district. Accepting creates the plan through the same slot engine and HV booking rules with the request's `requestRef`, so `CARE_PLAN_CONFIRMED` follows. Migration `20261120140000_kn_care_plan_request_expand`. Test: `nurse/kn03-care-plan-requests.integration.test.ts`.

## Web tests

- unit: `features/nurse/nurse-i18n.node.test.ts` (every key in EN and AR, dynamic families complete, Arabic is not copied English).
- Playwright (system Chrome; `PLAYWRIGHT_NO_SERVER=1`): `e2e/nurse-solo.spec.ts` (booked -> on my way -> arrived -> vitals with critical-value escalation -> doctor order + MAR with duplicate / off-order blocks -> sign -> finished), `nurse-agency.spec.ts` (dispatch / reassign, aide + unverified nurse blocked, UI bypass refused by the server), `nurse-safety.spec.ts` (timer, I'm safe, SOS, unsafe abort is not a no-show), `nurse-mar.spec.ts` (allergy, expired order, controlled witness), `nurse-gated.spec.ts` (shared dev stack: awaiting-gate states, proposed plan prices, onboarding, Arabic RTL, Passport-first login on `nurse.localhost`).
- The gated capabilities (GKN1) are exercised on a throw-away second stack: `bash scripts/nurse-e2e-stack.sh` starts API :3011 whose flag snapshot comes from `apps/web/e2e/support/nurse-flag-snapshot-server.ts` (a fixture that marks gates satisfied; **not** a real gate, refuses `NODE_ENV=production`, the shared stack and the control plane are untouched) and web :5175. Run: `npx playwright test --project=nurse-open` (5175) and `--project=nurse-gated` (5174), demo password `Demo@12345`.

## Tests

`nurse/nurse.node.test.ts` (MAR negative paths, vitals, schedule, edition/host, plans, edition-gated flags, scope contract, commission narrowing, family token) ·
`nurse/kn01-nurse.integration.test.ts` (sign-up, MAR in the DB, escalation-before-sign, shifts, roster/pay, family update, BR55) · `nurse/kn02-care-plans.integration.test.ts` ·
`auth/kn03-nurse-oidc.integration.test.ts` · web `lib/edition.node.test.ts`.

## Not built / follow-ups

- KNLAB01 (sample collection against a lab order) needs Kiorly Lab (M15).
- Web: photo upload for doctor's-order images (the order lines are entered by the nurse; the image goes through the patient documents), a map view, and a native app shell are not built.
- The P3 care-plan request is a draft contract: the shape follows contracts 1.5.0 and changes with them.
- Versioned amendments for signed visit records (encounters have them) are a follow-up; signed records are locked.
