# Kiorly Clinic (Clinic and Nurse editions): demo data and manual test guide (DEV ONLY)

> **DEV ONLY / synthetic.** Fictional names, phones `+20100000xxxx`, e-mails `@demo.kiorex.test` / `@nurse-demo.kiorly.test`. Passwords are local development values (blocked in production by the demo-seed guard). Messaging, PSP and video are mocked. Workspace index: [../DEMO_DATA.md](../DEMO_DATA.md) · shared tables (OTP, URLs, passwords): [../TEST_DATA.md](../TEST_DATA.md) · seed reference: [Docs/TEST_DATA.md](Docs/TEST_DATA.md) · older `demo`-password data: [Docs/Test_Data_Users.md](Docs/Test_Data_Users.md).
> Checked against the running API on `:3010` and the `kiorly` database on 21 Nov 2026. Working branch stays `kiorex`.

## 1. What this demo is for

Three Clinic-edition organisations (Pro, Pro, trial) and two Nurse-edition organisations (solo and agency), plus a Basic (Lite) clinic, so that every role, plan gate, appointment status, billing state, Kiorex marketplace state and Rev 2.3 home-care state can be seen on `http://localhost:5174` without creating data. The same people also exist in Kiorex (patients) and Passport, so cross-product flows (booking from Kiorex, nurse sample to Lab) run end to end.

## 2. Start and seed

```bash
e2e/scripts/up.sh [--build] [--seed]            # workspace root: Postgres :5433, Passport :4400, Kiorly API :3010, Kiorex :4000, Pharmacy :3100, Lab :3200
cd clinics-management && npm run dev -w web      # Kiorly Clinic web on http://localhost:5174 (Vite proxies /api to :3010)
cd clinics-management/apps/api
npm run db:seed                                  # base seed, once (plans, market EG, kx_dev_client, the older `demo` tenants)
npm run db:seed:demo                             # idempotent demo dataset (prisma/demo/seed-demo.ts, includes the Rev 2.3 part)
npm run db:seed:demo -- --reset                  # deletes ONLY demo tenants (demo_t_* incl. the two Nurse ones) and re-creates them, dates re-anchored to today
npm run db:seed:mobile                           # Kiorly Work add-on: Basic clinic + mobile alerts (idempotent; scripts/seed-all.sh runs it right after db:seed:demo; see ../kiorly-work/DEMO_DATA.md)
../../scripts/seed-all.sh [--reset]              # all products in order (needed once for the Kiorex mirror and the Lab hand-off)
```

* `npm run dev` at the repo root (API + web + docs, with `scripts/wait-api-and-dev-web.sh`) uses branch-specific ports from `scripts/local-dev-ports.sh` (`kiorex`: API 3010, web 5174, docs 5175; `main`: 3020 / 5190 / 5191). CAUTION: `scripts/free-dev-ports.sh` also frees the shared alternates (3000 / 3010 / 3020 / 5173 / 5174 / 5175 / 5190 / 5191 / 4175), so it stops a second checkout's servers and the stack's API on :3010. To only add the web, use `npm run dev -w web` (:5174).
* Live home visits (en route / arrived / just aborted) are anchored to the seed instant; the 15 s safety scheduler prompts/escalates an *arrived* visit nobody answers after about 40 min. Re-run with `--reset` for fresh ones.
* First login of any staff user shows the legal-terms acceptance banner (real UI behaviour).

## 3. Personas (web `http://localhost:5174/login`; API `POST :3010/api/v1/auth/login`)

Password for every `@demo.kiorex.test` and `@nurse-demo.kiorly.test` account: **`Demo@12345`** (DEV ONLY). "Tabs" = `roleNavTabKeys` returned by the API on 21 Nov 2026.

### 3.1 Organisations

| Tenant id | Name | Edition / plan | Users | Patients | Appointments / home visits |
|---|---|---|---|---|---|
| `demo_t_na` | Nile Care Medical Center (DEMO), 2 branches Maadi + Heliopolis | CLINIC / **PRO** active | 16 | 70 | 1,098 appts (completed 649, cancelled 133, no-show 122, confirmed 109, scheduled 82, checked-in 5) |
| `demo_t_df` | Delta Family Clinics (DEMO), Mansoura | CLINIC / **PRO** active (+ Kiorex commission on invoice) | 11 | 40 | 398 appts |
| `demo_t_ss` | Smile & Skin Studio (DEMO) | CLINIC / **LITE base, TRIALING** (14-day trial, CLINIC trial entitlements) | 9 | 24 | 270 appts |
| `demo_t_bs` | Corner Family Clinic (DEMO Basic) | CLINIC / **LITE (Basic)** active | 3 | 1 | none |
| `demo_t_nsolo` | Demo Home Nursing (Mona) | **NURSE** (SOLO) / NURSE_PRO | 1 | 4 | 10 seeded `demo_hv_*` home visits (66 rows live on 21 Nov: 56 are test leftovers, see section 7) |
| `demo_t_nagy` | Demo Care Agency | **NURSE** (AGENCY) / NURSE_AGENCY | 8 | 9 | 22 seeded home visits (45 rows live, 23 test leftovers) |
| `cmwnwj13x0009s3kz2z8r6df0` | Kiorly Clinic Group (Demo) | CLINIC / ENTERPRISE | 23 | 300 | pre-existing demo (`demo` password) |

### 3.2 Nile Care (`na`), Delta (`df`), Smile & Skin (`ss`)

| Login | Role | Tabs (from the API) | Notes |
|---|---|---|---|
| `owner.na@demo.kiorex.test` (Ahmed Fawzy) | GROUP_ADMIN | admin, appointments, clinics, customer_support, dashboard, encounters, expenses, patients, profile, reports, revenue | same pattern `owner.df@`, `owner.ss@` (`ss` also gets hr, operations) |
| `manager.na@` (Branch Manager Nile Care) | BRANCH_MANAGER | same set as the owner | `manager.df@`, `manager.ss@` |
| `frontdesk1.na@`, `frontdesk2.na@` | RECEPTIONIST | appointments, encounters, patients, profile | front-desk board is under Appointments |
| `nurse.na@` | NURSE | appointments, encounters, patients, profile | |
| `accountant.na@` | FINANCE_OFFICER | expenses, operations, profile, reports, revenue (no Admin, Clinics, Patients, Encounters) | billing/money only |
| `callcenter.na@` | CALL_CENTER | appointments, customer_support, patients, profile | |
| `nadia.na@` Dr Nadia Fouad (paediatrics, also HOME visits) | PHYSICIAN | appointments, encounters, patients, profile, reports | |
| `walid.na@` dermatology, `tamer.na@` cardiology, `rania.na@` ob-gyn, `khaled.na@` dentistry, `hossam.na@` orthopaedics, `ingy.na@` ENT, `sherif.na@` internal medicine | PHYSICIAN | as Nadia | 8 Nile Care doctors, all LIVE on Kiorex |
| `mai.na@` Dr Mai Hassan | PHYSICIAN (physiotherapist, MoH verified) | as Nadia | physio pack (`pack_physio`), home visits |
| `ola.df@` paediatrics, `medhat.df@` family medicine, `samah.df@` ophthalmology (Kiorex listing **PAUSED**, MoH licence EXPIRED), `hany.df@` Dr Hany Sobhy (physiotherapist, licence PENDING renewal) | PHYSICIAN | as Nadia | + `owner/manager/frontdesk1/frontdesk2/nurse/accountant/callcenter.df@` |
| `lamia.ss@` dermatology (Kiorex listing PAUSED by org flag), `adham.ss@` dentistry (verification **PENDING**) | PHYSICIAN | appointments, encounters, operations, patients, profile, reports | + `owner/manager/frontdesk1/frontdesk2/nurse/accountant/callcenter.ss@` |

### 3.3 Basic (Lite) clinic, `demo_t_bs`

| Login | Role | Tabs | Notes |
|---|---|---|---|
| `owner.basic@demo.kiorex.test` Ramy Hafez | GROUP_ADMIN | admin, appointments, customer_support, dashboard, encounters, patients, profile, revenue | no clinics/expenses/reports tabs (Lite) |
| `doctor.basic@` Dr Heba Lotfy, `nurse.basic@` Mervat Adel | PHYSICIAN / NURSE | appointments, encounters, patients, profile | mobile app: upgrade screen only |

### 3.4 Nurse edition

| Login | Org | Role | Tabs | Notes |
|---|---|---|---|---|
| `mona@nurse-demo.kiorly.test` (Mona Adel; Passport `+201000003001`) | Demo Home Nursing (Mona), SOLO | PHYSICIAN (nurse profession) | admin, appointments, customer_support, dashboard, encounters, patients, profile, reports, revenue | solo, MoH + syndicate VERIFIED, covers nasr-city / heliopolis / new-cairo, 12 open safety alerts |
| `owner@nurse-demo.kiorly.test` (Agency Owner; Passport `…3002`) | Demo Care Agency | CLINIC_ADMIN | admin, appointments, customer_support, dashboard, encounters, hr, patients, profile, reports, revenue | care-plan requests inbox |
| `dispatch@nurse-demo.kiorly.test` (Dina Dispatcher; `…3003`) | agency | RECEPTIONIST (dispatcher) | appointments, encounters, patients, profile | dispatch queue and guard; Kiorly Work: schedule, patients, home visits + org home-visit safety alerts (can acknowledge) |
| `nurse1@` Heba (`…3004`) | agency | PHYSICIAN | appointments, encounters, patients, profile, reports | VERIFIED; the demo nurse for the day route |
| `nurse2@` Salma (`…3005`) | agency | | | VERIFIED, MoH licence **expires in 18 days** |
| `nurse3@` Nadine (`…3007`) | agency | | | verification **REJECTED** (dispatch refuses) |
| `nurse4@` Rawan (`…3008`) | agency | | | licence **EXPIRED** (dispatch refuses) |
| `nurse5@` Yara (`…3009`) | agency | | | **UNVERIFIED** (dispatch refuses) |
| `aide@` Aya Aide (`…3006`) | agency | | | assistant; refused by the dispatch guard |
| Noha Nurse (`+201000003011`) | none | | | Passport only: pending agency invitation `demo-invite-agency-nurse` |
| Nabila Hamdy (Kiorex/Passport `+201000001013`) | agency client | patient | | care plan, MAR, shifts |

"Sign in with Kiorex Passport" on the Kiorly login works for the Nurse personas and the physio (identity links are seeded): phone `+2010000030xx`, OTP `000000`.

### 3.5 Pre-existing data (kept, `demo` password)

`admin@kiorly.com` / `demo` (Group admin, Kiorly Clinic Group (Demo), ENTERPRISE) · `superadmin@kiorly.com` / `demo` (PLATFORM_SUPER_ADMIN: Platform tab, create orgs) · `admin@drahmedshall.com` / `demo` (Dr Ahmed Shall Group, 42 users) · `finance@kiorly.com`, `receptionist@kiorly.com`, `nurse@kiorly.com`, `callcenter@kiorly.com`, `staff3..11@kiorly.com` (see Docs/Test_Data_Users.md). The KX-DEV doctors `kxdev.*@kiorly.dev` belong to the e2e suite. These three logins (`admin@kiorly.com`, `superadmin@kiorly.com`, `admin@drahmedshall.com`) were verified with `demo` on 21 Nov 2026; `mona@nurse-demo.kiorly.test` with `demo` is **401** (the old Nurse seed password was replaced by `Demo@12345`).

## 4. What data exists and where to click

Patients: the first 12 of `na` are the Passport personas (`+201000001001..1012`, MRN `NA-100001..100012`: Hoda Mahmoud, Samir Nassar, Karim Mostafa, Nourhan Fathy, Mahmoud El-Sayed, Mariam Adel, Omar Hegazy, Dalia Ibrahim, Tarek Zaki, Heba Salah, Youssef Ramadan, Rana Khaled), AR + EN names, allergies, problems, families. Agency patients include Nabila Hamdy (`+201000001013`); Mona's include Hoda, Nourhan.

| Data | Detail | Where to click |
|---|---|---|
| Appointments | every status; sources front desk, phone, walk-in, clinic link, Kiorex WhatsApp, Kiorex marketplace; Kiorex ones are `demo_mk_<key>` (28, from `demo-marketplace-bookings.json`) | Appointments (list + calendar); set the dashboard period to the last 60 days |
| Live queue | `na`: 4 checked-in walk-ins today (WAITING / CALLED / IN_EXAM), Room 3 | Appointments -> Front desk board (`/front-desk/board`) |
| Encounters | SOAP, vitals, ICD-10, prescriptions (QR token `demo-rx-<encounterId>`), lab/imaging orders (ordered / in progress / results ready) | Patients -> patient -> Encounters; public Rx page `/rx/<token>` |
| Billing | invoices with 14 % VAT line (plain configurable %, no tax authority), paid + receivable; expenses (35 in `na`: approved / pending / rejected) | Revenue, Invoices, Expenses |
| Waitlist, recalls | entries and campaigns | Appointments -> Waitlist; Recalls |
| Kiorex tab | listings LIVE / PAUSED / PENDING_VERIFICATION, reviews (some replied, one hidden), commission charges pending / confirmed / billed / disputed / waived (rate labelled *DEV-DEMO-NOT-A-REAL-RATE*) | `/kiorex` |
| Plan and billing | `na` PRO active, `df` PRO + commission invoice, `ss` TRIALING; credit wallet + ledger; SaaS invoices paid / issued / part-paid | Admin -> plan and billing / credits |
| Messaging | dev inbox WhatsApp / e-mail, delivered / read / failed | `/dev/inbox` (Kiorly) |
| Home visits (seed, 36) | REQUESTED 1, CONFIRMED 16 (incl. the unassigned agency queue), ON_MY_WAY 2, ARRIVED 2, FINISHED 8, ABORTED_UNSAFE 4, CANCELLED 2, NO_SHOW 1; addresses encrypted (visible to assignee + admins, wiped 24 h after) | Nurse views: `/home-visits/today`, `/nurse/dispatch`, `/nurse/visits/:id`, `/nurse/safety` |
| Care plans and MAR | Nabila's "Post-operative wound care" (4 of 10 done), doctor orders (shared / photo / controlled + witness / expired / revoked), signed visit records, vitals trend with one CRITICAL, private-duty shifts (booked / completed with handover / cancelled) | `/nurse/care-plans`, `/nurse/mar`, `/nurse/shifts` |
| Care-plan requests | `kx_cp_demo_1` ACCEPTED, `kx_cp_demo_2` RECEIVED (Mahmoud, waiting), `kx_cp_demo_3` DECLINED (Rana) | `/nurse/inbox` |
| Nurse samples (KNLAB01) | `demo_lo_nl1` RELEASED (report link), `nl2` AWAITING_VALIDATION, `nl3` in transit, `nl4` REFUSED by the lab; Rana's Lab consent **revoked**, Nourhan **never asked** -> refusal `LAB_HANDOFF_NO_CONSENT` | `/nurse/lab`, `/nurse/lab/:orderId` |
| Physio | referrals, assessments, active + discharged plans, progress notes, pain/ROM trend, HEP link, 10-session series for Mahmoud El-Sayed (3 done) | as `mai.na@`: Patients -> Mahmoud -> physio |
| Verification states | VERIFIED Mona / Heba / Salma / Mai; REJECTED Nadine; EXPIRED Rawan and Dr Samah; UNVERIFIED Yara; PENDING Dr Adham and Dr Hany's physio licence | `/profile/verification`, `/verifications` (platform), agency Team |
| Mobile add-on | `demo_enc_mobile_rx` (Cetirizine prescription awaiting signature, DRAFT), `demo_co_mobile_crit` (potassium 6.9 mmol/L CRITICAL_HIGH) + `demo_co_mobile_norm`, open alerts | Kiorly Work app, see its doc |

## 5. Manual test scripts

**C1. Front desk day (frontdesk1.na).** 1) Log in `frontdesk1.na@demo.kiorex.test` / `Demo@12345`, accept the legal banner. 2) Appointments -> Front desk board. *Expected:* waiting / called / in-exam tickets from today's walk-ins. 3) Call the next ticket. *Expected:* the ticket moves to CALLED. 4) Appointments -> New appointment for Hoda Mahmoud, Dr Nadia Fouad, first free slot, source Phone. *Expected:* appears in the list as SCHEDULED. 5) Check her in. *Expected:* CHECKED_IN and a queue ticket.

**C2. Doctor consultation (nadia.na).** 1) Log in as Dr Nadia. 2) Appointments: only her own. 3) Open a CHECKED_IN patient -> Encounter. 4) Add a SOAP note, a diagnosis, a prescription line, finalize. *Expected:* encounter locks, the prescription gets a QR token and a public `/rx/<token>` page. 5) Patients -> Hoda -> allergies and problems are shown. *Not expected:* Revenue or Admin tabs.

**C3. Owner dashboard and money (owner.na).** 1) Log in as owner, Dashboard -> period last 60 days. *Expected:* KPIs for 2 branches. 2) Revenue / Invoices: a 14 % VAT line on an invoice, paid and receivable rows. 3) Expenses: approve a pending one. 4) Admin -> plan and billing: Nile Care **PRO active**; credits wallet + ledger; SaaS invoices (paid / issued / part-paid). 5) Kiorex tab: listings (LIVE), reviews (reply to one), commission charges in each state.

**C4. Plan gates (Basic and trial).** 1) `owner.basic@` -> *Expected:* no Clinics, Expenses, Reports tabs; opening `/expenses` or `/reports` directly is refused or shows the plan paywall (Lite has no `mod_expenses`/`mod_reports`). 2) `owner.ss@` (TRIALING) -> trial banner with days left; Operations and HR tabs present. 3) `owner.na@` (PRO) -> Reports present, Operations absent (`mod_operations` false on PRO).

**C5. Kiorex booking arrives (cross-product).** 1) In Kiorex patient web (see ../kiorex-platform/DEMO_DATA.md K2) book Dr Nadia as Hoda. 2) In Kiorly as `frontdesk1.na@` open Appointments. *Expected:* a new appointment with source Kiorex marketplace and the deposit badge; checking it in and completing it feeds back to Kiorex (COMPLETED + review invitation).

**C6. Listing states (Kiorex tab + flags).** 1) `owner.df@` -> Kiorex: Dr Samah is PAUSED (licence expired, eligibility sweep). 2) `owner.ss@` -> Kiorex: listings OFF because `clinic.kiorex_listing` is OFF for org `demo_t_ss`; Dr Adham verification PENDING. 3) As the Kiorex ops super admin switch the flag (ops console -> Flags) and watch the Kiorly tab follow within seconds.

**C7. Nurse day: route, visit, vitals (nurse1@nurse-demo / Heba).** 1) Log in, open `/home-visits/today`. *Expected:* her route for today (assigned visits, en route / arrived). 2) Open a visit -> address is readable for the assigned nurse. 3) Depart, Arrive, record vitals (a systolic far out of range). *Expected:* a CRITICAL vitals alert and escalation. 4) Fill the visit record and sign. 5) Orders / MAR: administer a shared doctor order; a controlled one asks for a witness. 6) Press SOS on a test visit. *Expected:* SOS alert in `/nurse/safety` and in the inbox of the agency owner.

**C8. Dispatch and the verification guard (dispatch@).** 1) Log in as Dina -> Dispatch. *Expected:* the unassigned agency visits queue. 2) Assign one to Heba or Salma -> succeeds (Salma shows a licence-expiry warning). 3) Try Nadine, Rawan, Yara, Aya -> refused (REJECTED / EXPIRED / UNVERIFIED / aide). *Expected:* a named refusal, no assignment.

**C9. Care-plan requests (owner@nurse-demo).** 1) Log in as the agency owner -> `/nurse/inbox`. 2) `kx_cp_demo_2` (Mahmoud) is RECEIVED: accept it. *Expected:* a care plan with visits is created and Kiorex shows CONFIRMED for the patient. 3) `kx_cp_demo_1` ACCEPTED and `kx_cp_demo_3` DECLINED (reason) are listed read-only.

**C10. Nurse sample -> Lab -> result (KNLAB01).** 1) As Heba open `/nurse/lab`: `nl1` released with a custody timeline and report link; `nl2` awaiting validation; `nl3` in transit; `nl4` refused (`SAMPLE_UNMATCHED`). 2) Record a new sample for Hoda or Nabila (consent granted) -> hand-over succeeds. 3) Try Rana -> refused `LAB_HANDOFF_NO_CONSENT` (revoked); Nourhan -> refused (never asked). 4) In Kiorly Lab (../kiorly-lab/DEMO_DATA.md L6) receive `DEMO-NL3-EDTA`, then watch the status come back.

**C11. Physio (mai.na@).** 1) Log in, Patients -> Mahmoud El-Sayed. 2) Assessment, active plan, progress notes, pain/ROM trend, the HEP link, the 10-session series (3 done). *Expected:* available only because `pack_physio` is on for Nile Care (it is off on PRO tenants without it).

**C12. Accountant boundaries.** Log in `accountant.na@`: confirm Revenue, Expenses, Reports are reachable; compare the tab list with section 7 first.

## 6. What each role should and should not see (checklist)

| Role | Should see | Should NOT see / do |
|---|---|---|
| Group admin (owner.*) | all clinics' data, Admin (users, plan, credits), Kiorex tab, Revenue, Expenses, Reports | other organisations; the Platform tab (only `superadmin@`) |
| Branch manager | same tab set as the owner for the tenant (API), incl. branch Admin | other tenants |
| Receptionist / front desk | Appointments, front desk board, patients, check-in, queue | Revenue, Expenses, Admin, signing prescriptions |
| Call centre | Appointments, patients, Customer support | encounters, Revenue |
| Physician | own appointments and encounters, patients, own Reports | other doctors' encounters, Revenue, Admin |
| Nurse (Clinic edition) | appointments, encounters (vitals), patients | signing prescriptions (profession NURSE cannot), Revenue |
| Finance officer | Revenue, Expenses, Reports | clinical notes (compare section 7) |
| Nurse edition: solo / agency nurse | own route and visits, MAR, own safety alerts | addresses of visits not assigned to them; Revenue (agency nurses) |
| Dispatcher | dispatch queue, assignment, Kiorly Work home visits + home-visit safety alerts (read/ack) | clinical records, prescriptions, Revenue |
| Basic (Lite) | appointments, patients, encounters, Revenue snapshot | Clinics, Expenses, Reports, mobile app modules (upgrade screen) |
| Home-visit address | assignee and admins within 24 h of the visit | everyone after 24 h (masked) |

## 7. Known limitations and inconsistencies found

* Providers are mocked: WhatsApp/e-mail go to the dev inbox, PSP is `sandbox-fake`, video is `mock`. Entitlement gates and feature flags decide visibility, not hidden UI alone.
* **Mona's tenant has extra home-visit rows** (cuid ids from integration/e2e runs) on top of the 10 seeded `demo_hv_*`: 66 rows on 21 Nov (56 extra; 22 cancelled, 9 arrived, 15 finished, 8 aborted-unsafe, 9 confirmed), so her "today" route is noisier than the seed intends; the agency tenant has 45 rows (22 seeded + 23 extra). The extra count keeps growing with every e2e run. `--reset` removes demo tenants and recreates them.
* BRANCH_MANAGER keeps the full branch admin tab set; FINANCE_OFFICER (`accountant.na@`) now gets billing tabs only (expenses, operations, revenue, reports, profile), matching `Docs/Test_Data_Users.md` ("no Admin").
* Patient counts: `na` 70 seeded (+2 e2e), `df` **40** (older docs said 39, fixed), `ss` 24; Smile & Skin is LITE base on a CLINIC trial.
* The `5174` web is a Vite dev server: start it by hand (not part of `up.sh`).

---
Verified: 2026-11-21 (seed scripts, `kiorly` database via SELECT, `free-dev-ports.sh` guard check).
