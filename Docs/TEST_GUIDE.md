# Kiorly Clinic test guide (DEV ONLY, branch kiorex)

> **DEV ONLY / synthetic.** All names, phones, e-mails, passwords, OTPs and TOTP seeds below are fake values for the local stack; they are refused when `NODE_ENV=production` and the sign-in page has no quick-pick or demo hint in any build (sign in by typing the seeded credentials). Providers are mocked (dev inbox / logs, PSP `sandbox-fake`, video `mock`). No tax-authority integration.
> This guide is the repo's slice of the workspace guide `TEST_GUIDE.md` (parent folder `kiorex-v2/`, not part of this repository). Facts verified against the seeds and dev databases on 23 Nov 2026.

## Run the stack and seed it

```bash
# from the workspace root (kiorex-v2/): Postgres :5433 + the five APIs (Passport :4400, Kiorly :3010, Kiorex :4000, Pharmacy :3100, Lab :3200)
e2e/scripts/up.sh --build --seed      # first time; later just e2e/scripts/up.sh (stop: e2e/scripts/down.sh)
scripts/seed-all.sh                   # idempotent demo data in dependency order (--reset re-creates demo rows only)
```
One service only: `e2e/scripts/up.sh --restart --only=passport|kiorly|kiorex|pharmacy|lab > /tmp/up.log 2>&1`. Never touch ports 3000 / 5173 / 5175. Tests you run change data (a cancel stays cancelled): re-seed for the starting state.

```bash
cd clinics-management
npm run dev -w web                       # Kiorly Clinic web :5174 (API :3010 is started by the workspace stack)
cd apps/api && npm run db:seed:demo      # idempotent; -- --reset ; npm run db:seed:mobile for the staff app
cd apps/web && npm run check:dev-test-users
```

URL: http://localhost:5174/login (API http://localhost:3010/api/v1).

## Sign-in (no quick-pick panel)

The login page shows no test-user panel, demo hint or prefilled credential in any build (asserted by `scripts/check-no-dev-test-users.mjs`). Sign in by typing the seeded e-mail and password below, or through the API. "Sign in with Kiorex Passport" also works for the Nurse personas (phone `+2010000030xx`, OTP `000000`).

## Test users: 3.3 Kiorly Clinic web (:5174, password `Demo@12345`)

| Group | Logins |
|---|---|
| Nile Care Medical Center (PRO, 2 branches, Kiorex listings LIVE) | `owner.na@` Ahmed Fawzy (group admin), `manager.na@`, `frontdesk1.na@` / `frontdesk2.na@` (receptionist), `nurse.na@`, `accountant.na@` (finance officer), `callcenter.na@`, doctors `nadia.na@` (paediatrics, also home), `walid.na@` (dermatology), `tamer.na@` (cardiology), `rania.na@`, `khaled.na@`, `hossam.na@`, `ingy.na@`, `sherif.na@`, physio `mai.na@` — all `@demo.kiorex.test` |
| Delta Family Clinics (PRO) | `owner.df@`, `manager.df@`, `frontdesk1.df@`, `nurse.df@`, `accountant.df@`, `callcenter.df@`, doctors `ola.df@`, `medhat.df@`, `samah.df@` (listing PAUSED, licence expired), `hany.df@` |
| Smile & Skin Studio (Lite base, trialing) | `owner.ss@` (also HR + operations tabs), `lamia.ss@` (listing paused by org flag), `adham.ss@` (verification pending) and the same staff roles with `.ss@` |
| Corner Family Clinic (**Basic**) | `owner.basic@` Ramy Hafez, `doctor.basic@` Dr Heba Lotfy, `nurse.basic@` Mervat Adel |
| Nurse edition (`@nurse-demo.kiorly.test`) | `mona@` solo nurse, `owner@` agency owner, `dispatch@` dispatcher, `nurse1@` Heba (verified), `nurse2@` (licence expires in 18 days), `nurse3@` (rejected), `nurse4@` (expired), `nurse5@` (unverified), `aide@` (refused by dispatch) |
| Older accounts, password **`demo`** | `admin@kiorly.com` (Enterprise group admin), `superadmin@kiorly.com` (platform super admin: Platform tab, create orgs), `admin@drahmedshall.com` (42 users) |
| 36 specialties tenant `demo_t_sp` | `<key>.sp@demo.kiorex.test`, owner `owner.sp@` (table in TEST_DATA.md) |

The panel lists 26 of these (every group); all 26 were logged in through the API on 23 Nov 2026. First login of a staff user shows the legal-terms banner.

## Flows

### 4.5 Kiorly Clinic (C1-C12)

All at http://localhost:5174/login, chips grouped by organisation.

1. **Front desk day (`frontdesk1.na@`).** Accept the legal banner. Appointments -> Front desk board shows waiting / called / in-exam tickets; call the next ticket (CALLED); New appointment for Hoda Mahmoud with Dr Nadia, first free slot, source Phone (SCHEDULED); check her in (CHECKED_IN and a queue ticket).
2. **Doctor consultation (`nadia.na@`).** Appointments: only her own; open a CHECKED_IN patient and run the encounter; a signed prescription appears in Hoda's vault.
3. **Owner dashboard and money (`owner.na@`).** Dashboard over 60 days shows KPIs; Revenue, Expenses, Reports, Clinics tabs are present.
4. **Plan gates.** `owner.basic@` has no Clinics, Expenses or Reports tabs and opening them shows the upgrade notice; `owner.ss@` is a trial with 14-day entitlements.
5. **Kiorex booking arrives.** Book as Hoda on the patient web (workspace guide 4.2 step 1) and see it at `frontdesk1.na@` with source Kiorex marketplace; Kiorex tab and reviews.
6. **Listing states.** `owner.df@` -> Kiorex: Dr Samah PAUSED (licence expired), `lamia.ss@` paused by org flag, `adham.ss@` verification pending.
7. **Clinic self-service import.** As a group admin (`owner.na@`) open `/onboarding` (checklist) and `/onboarding/import`: pick Patients, Appointments, Price list or Staff, download the CSV template, upload a file, choose the duplicate handling, review the preview and the error report, commit; **Undo** reverts the batch. *Expected:* history lists the job with counts; invalid rows are reported with row, field and code, not silently dropped. (The ops-side import of another organisation's legacy dump is workspace guide 4.4 step 5.)
8. **Nurse day (`nurse1@nurse-demo.kiorly.test`, Heba).** `/home-visits/today`: her route; open a visit (address readable for the assigned nurse); depart, arrive, record vitals with a systolic far out of range. *Expected:* a CRITICAL vitals alert and escalation; fill and sign the visit record; administer a shared doctor order (a controlled one asks for a witness); SOS on a test visit appears in `/nurse/safety` and the agency owner's inbox.
9. **Dispatch (`dispatch@`).** Dispatch lists the unassigned agency queue; assigning nurses 3 to 5 and the aide is refused (rejected / expired / unverified / not a nurse).
10. **Care-plan requests (`owner@nurse-demo`).** `/nurse/inbox`: accept `kx_cp_demo_2`; `kx_cp_demo_1` accepted and `kx_cp_demo_3` declined are read-only.
11. **Nurse sample to Lab and back (KNLAB01).** Heba `/nurse/lab`: `nl1` released with custody timeline and report link, `nl2` awaiting validation, `nl3` in transit, `nl4` rejected. In Lab: `tech@demo-lab.test` receives `DEMO-NL3-EDTA`, `signatory@` validates and releases `nl2`; the nurse sees the report. A new sample for Hoda or Nabila works; Rana (consent revoked) and Nourhan (none) show named refusals.
12. **Physio (`mai.na@`).** Mahmoud El-Sayed: assessment, plan, progress notes, outcome trends, HEP link, 10-session series.
13. **Accountant limits (`accountant.na@`).** Revenue, Expenses, Reports reachable; no Admin, Clinics, Patients, Encounters.
14. **Arabic and RTL.** Use the language toggle on the login page or inside the app; the layout mirrors and `dir="rtl"`.

15. **Telehealth (ADR-039).** `npm run db:seed:telehealth -w api` prints two URLs. Sign in as Dr Nadia (`nadia.na@demo.kiorex.test`) and open the doctor URL (`/telehealth/<id>`), then open the patient URL (`/v/<token>`) in a second browser or a private window (allow camera and microphone in both; Chrome can use `--use-fake-device-for-media-stream`). *Expected:* patient sees the visit time in the device timezone, device check, waiting room; both reach "Good connection"; **Audio only** switches both sides; after 3 minutes together the appointment becomes Checked in, one pre-filled **Telehealth** encounter exists (chief complaint from the notes), and for a Kiorex-booked new patient exactly one commission charge (the existing EGP 40 market rate row) appears; **End** shows the end screen on the patient page. Also try: appointment details > **Regenerate link** (old link says "not valid"), edit the time (same link, patient gets "moved to ..."), change the visit type to in-clinic (link says "changed to in-person"), cancel (link says "cancelled"), open the link 30+ minutes early ("opens 10 minutes before"), and never join (after 15 minutes the session is Missed and the patient is a no-show; if the doctor never joined it is flagged for staff review and nobody is charged). Switch flag `telehealth.video` OFF in the ops console: new telehealth options disappear, the scheduled visit stays with a "Telehealth is disabled" banner. Kiorex side: a doctor with "Offers telehealth" (profile page) and a VIDEO service appears with VIDEO slots only while the flag is on.

More: `DEMO_DATA.md` (C1-C12), `Docs/TEST_DATA.md`, `Docs/Test_Data_Users.md`.

16. **Growth and Marketing (GRW-P1-D1/D2).** Sign in as `admin@kiorly.com`, open **Growth & Marketing** (sidebar or the Kiorex tab). Create a desk link, open **QR and print**, scan the QR (it opens `/q/<code>` then the clinic page), print the Arabic poster, pause, resume, revoke. Widget tab: try `http://x.com`, a wildcard and 11 origins (blocked), then save two https origins. Tests: `npm run test:unit -w api`; with `DATABASE_URL` set to a test database, `node --import tsx --test --test-concurrency=1 src/growth/provider-links/provider-links.integration.test.ts src/kiorex/cr10-commission-intake.integration.test.ts` (from `apps/api`); Playwright against the running stack: `GROWTH_BASE_URL=http://localhost:5174 npx playwright test -c playwright.growth.config.ts` (from `apps/web`). Details: `Docs/GROWTH.md`.
17. **Provider marketing portal v2 and marketplace contract gaps (GRW-P2-C, GRW-GC-2).** Sign in as `admin@kiorly.com`, open **Growth & Marketing**, tab **Share**: pick a template, add a short line, create the card, copy the caption, download the image; try "We guarantee results" (refused). Tab **Free times**: choose up to 5 times, create the card; book one of them elsewhere and create again (the card is refused with the remaining times). Tab **Verified profile**: request a licence number change (the badge reads "update under review"), withdraw it. Tab **Fee statement**: pick a month, download CSV and PDF. In the staff app (Growth tab) open the four new rows. Tests: `node --import tsx --test --test-concurrency=1 src/growth/provider-marketing/provider-marketing.integration.test.ts src/marketplace/gc2-*.integration.test.ts` with `DATABASE_URL` set to `kiorly_test` (from `apps/api`); unit `npm run test:unit -w api`; Playwright `GROWTH_BASE_URL=http://localhost:5174 npx playwright test -c playwright.growth.config.ts`; staff app `npx jest` and `e2e-web/clinic-growth-v2.spec.ts`. Details: `Docs/GROWTH.md`.
