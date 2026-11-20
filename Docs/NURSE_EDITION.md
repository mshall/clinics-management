# Kiorly Nurse edition (KNED / KNSVC / KNCP / KNREC / KNMAR / KNESC / KNFAM / KNSH / KNAG / KNRPT)

KX-23 · ADR-031 (edition, not a product) · ADR-032 (solo vs agency). **One codebase, one database, one API, one Kiorex connector.** Never a `kiorly-nurse` repo.
Code: `apps/api/src/nurse/`, web mirror `apps/web/src/lib/edition.ts` + `features/edition/edition-boot.tsx`, Prisma models in `schema.prisma`.

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

## Tests

`nurse/nurse.node.test.ts` (MAR negative paths, vitals, schedule, edition/host, plans, edition-gated flags, scope contract, commission narrowing, family token) ·
`nurse/kn01-nurse.integration.test.ts` (sign-up, MAR in the DB, escalation-before-sign, shifts, roster/pay, family update, BR55) · `nurse/kn02-care-plans.integration.test.ts` ·
`auth/kn03-nurse-oidc.integration.test.ts` · web `lib/edition.node.test.ts`.

## Not built / follow-ups

- KNLAB01 (sample collection against a lab order) needs Kiorly Lab (M15).
- Web screens for care plans, MAR and the agency roster are API-first; only the edition shell, terminology and the home "Today" route page are in the web.
- `POST /marketplace/v1/care-plan-requests` (P3 draft in the contracts) is not implemented; plans created by staff carry `requestRef` support already.
- Versioned amendments for signed visit records (encounters have them) are a follow-up; signed records are locked.
