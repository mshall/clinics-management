# Test data — Kiorly Clinic (DEV ONLY)

> **DEV ONLY / synthetic.** Fictional names, phones `+20100000xxxx`, e-mails `@demo.kiorex.test`. Passwords and OTPs here are local dev values, blocked in production.
> No tax-authority integration; VAT is a plain configurable line. Messaging/PSP/video are mocked. Cross-product index: `TEST_DATA.md` in the workspace root (`kiorex-v2/`).

## Run / reset
```bash
cd apps/api
npm run db:seed                      # base seed (once; creates plans, market EG, kx_dev_client, older demo tenants)
npm run db:seed:demo                 # idempotent demo dataset (prisma/demo/seed-demo.ts)
npm run db:seed:demo -- --reset      # deletes ONLY the 3 demo tenants (ids demo_t_*) and re-creates them, dates re-anchored to today
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
