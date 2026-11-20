# Test data — Kiorly Clinic (DEV ONLY)

> **DEV ONLY / synthetic.** Fictional names, phones `+20100000xxxx`, e-mails `@demo.kiorex.test`. Passwords and OTPs here are local dev values, blocked in production.
> No tax-authority integration; VAT is a plain configurable line. Messaging/PSP/video are mocked. Cross-product index: `TEST_DATA.md` in the workspace root (`kiorex-v2/`).

## Run / reset
```bash
cd apps/api
npm run db:seed                      # base seed (once; creates plans, market EG, kx_dev_client, older demo tenants)
npm run db:seed:demo                 # idempotent demo dataset (prisma/demo/seed-demo.ts)
npm run db:seed:demo -- --reset      # deletes ONLY the demo tenants (demo_t_* plus the two Nurse-edition tenants) and re-creates them, dates re-anchored to today
npm run db:seed:demo:rev23           # only the Rev 2.3 part (Nurse edition, physio, home visits, care plans, MAR); db:seed:demo already includes it
npm run db:seed:nurse                # the minimal older seed (tenants + users); now also run by the Rev 2.3 seed
```
From the workspace: `scripts/seed-all.sh [--reset]` (needs the Kiorex provider sync afterwards, which that script does). Branch stays `kiorex`.
Marketplace appointments `demo_mk_<key>` (externalReference `demo_bk_<key>`) come from `apps/api/prisma/demo/demo-marketplace-bookings.json`, mirrored byte-identical in kiorex-platform; do not edit one side only.

## Logins (password `Demo@12345`, DEV ONLY) — http://localhost:5174
Tenants: `na` Nile Care Medical Center (DEMO) — 2 branches Maadi/Heliopolis, 8 doctors (paediatrics, dermatology, cardiology, ob-gyn, dentistry, ortho, ENT, internal medicine); `df` Delta Family Clinics (DEMO) — Mansoura, 3 doctors; `ss` Smile & Skin Studio (DEMO) — trial, 2 doctors.
`<role>.<tenant>@demo.kiorex.test` with role = `owner` (group admin), `manager`, `frontdesk1`, `frontdesk2`, `nurse`, `accountant` (finance officer), `callcenter`, or a doctor key (`nadia walid tamer rania khaled hossam ingy sherif` | `ola medhat samah` | `lamia adham`). Example: `owner.na@demo.kiorex.test`.
Older data is untouched (`admin@kiorly.com`/`demo`, `admin@drahmedshall.com`, KX-DEV doctors `kxdev.*@kiorly.dev` that the e2e suite books against).

## What exists (per tenant `na` / `df` / `ss`)
Patients 70 / 39 / 24 (AR+EN names; the first 12 of `na` are the Passport personas, phones `+201000001001…1012`) · ~1,140 / 450 / 280 appointments over -45…+14 days in every status (scheduled, confirmed, checked-in, completed, cancelled, no-show), sources front desk / phone / walk-in / clinic link / Kiorex WhatsApp / Kiorex marketplace · encounters with SOAP + vitals + ICD-10 + prescriptions (some with verification tokens `demo-rx-<encounterId>`), lab/imaging orders (ordered / in progress / results ready) · invoices with a 14 % VAT line, payments and posted/receivable revenue · expenses (approved/pending/rejected) · waitlist · recall campaigns · dev-inbox WhatsApp/e-mail messages + outbound log (delivered/read/failed) · marketplace listings LIVE/PAUSED/PENDING_VERIFICATION · commission charges, SaaS invoices, credit wallet, subscriptions (PRO active / PRO active / trial).
## Where to click
Appointments (list/calendar), Front desk board (4 live walk-ins in `na`), Patients -> a patient -> encounters, Revenue, Expenses, Waitlist, Recalls, Kiorex (listings, reviews, commission), Admin -> plan & billing / credits / invoices, Dev inbox.
## Not seeded / notes
First login shows the legal-terms acceptance banner (real UI). Messages are mock only. Fiscal/tax-authority tables are deliberately not used.

## Rev 2.3 additions (Kiorly Nurse edition, home visits, physio) — `prisma/demo/seed-rev23.ts`
Logins (password `Demo@12345`, DEV ONLY; the older `demo` password of `db:seed:nurse` is replaced): solo **Demo Home Nursing (Mona)** `mona@nurse-demo.kiorly.test`; agency **Demo Care Agency** `owner@`, `dispatch@` (dispatcher), `nurse1@`..`nurse5@`, `aide@nurse-demo.kiorly.test`; physiotherapists `mai.na@demo.kiorex.test` (Nile Care) and `hany.df@demo.kiorex.test` (Delta). "Sign in with Kiorex Passport" works for the Nurse personas (identity links seeded; Passport phones `+201000003001`..`3010`, OTP `000000`).
- **Verification states**: Mona/Heba/Salma/Mai VERIFIED, Nadine (`nurse3`) REJECTED, Rawan (`nurse4`) EXPIRED, Yara (`nurse5`) UNVERIFIED, Dr Adham PENDING, Dr Samah EXPIRED; `ProfessionalRegistration` rows in all 5 states (syndicate + MoH licence; Hany's physio licence PENDING renewal). The dispatch guard refuses nurses 3-5 and the aide.
- **Home settings** (coverage districts): Mona nasr-city/heliopolis/new-cairo, Heba maadi/zamalek/nasr-city/heliopolis, Salma heliopolis/nasr-city/new-cairo/maadi, Mai maadi/nasr-city/heliopolis, Nadia maadi/heliopolis/zamalek, Hany mansoura; HOME visit types with 30/30 buffers, surcharge and deposits; physio pack entitlement `pack_physio` on `na` and `df`.
- **Home visits (36)**: REQUESTED 1, CONFIRMED 16 (incl. the unassigned agency dispatch queue), ON_MY_WAY 2, ARRIVED 2, FINISHED 8, ABORTED_UNSAFE 4, CANCELLED 2, NO_SHOW 1; encrypted addresses (visible to the assigned nurse and admins, wiped 24 h after the visit), geostamps, safety alerts (SOS resolved, timer expired acknowledged, unsafe abort delivered / escalated / resolved), incidents. Source of truth for the Kiorex-origin ones: `prisma/demo/demo-home-visits.json` (byte-identical copy in kiorex-platform; edit both).
- **Agency client Nabila Hamdy** (`+201000001013`): care plan "Post-operative wound care" (4 of 10 done), signed visit records, vitals trend, doctor orders (shared / photo / controlled + witness / expired / revoked) with MAR, private-duty shifts (booked / completed with handover / cancelled), roster profiles and pay rates.
- **Physio (Nile Care)**: referrals, assessments, active + discharged treatment plans, progress notes, pain/ROM trend, HEP link, a 10-session series for Mahmoud El-Sayed.
- Live visits (en route / arrived / just aborted) are relative to the seed instant; the 15 s safety scheduler will raise a prompt/alert on an arrived visit nobody answers after ~40 min. Re-run with `--reset` to refresh.
- Also fixed in the base demo: demo bios are >= 40 chars and the unpaid Kiorly invoice is within terms, otherwise the eligibility sweep (profile completeness >= 80 %, overdue Kiorex billing) paused every demo listing.
