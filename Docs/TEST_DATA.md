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

## All 36 specialties: 72 demo doctors, searchable and bookable (added 22 Nov 2026)

DEV ONLY, synthetic. Every specialty of the Kiorex catalogue (`GET :4000/api/v1/specialties`, 36 codes) has **2 LIVE, verified doctors** in the new Kiorly demo tenant `demo_t_sp` "Kiorex Specialties Network (DEMO)" (3 branches: New Cairo `demo_c_sp_cairo`, Dokki `demo_c_sp_giza`, Alexandria/Smouha `demo_c_sp_alex`; 72 doctors, 40 + 12 persona patients, working days every day except Friday (12 doctors also close Saturday), 09:00-13:00 and 16:00-20:00 Cairo time, so every doctor has real bookable future slots; about 2,480 appointments, about 600 signed encounters). Gender mix 36 M / 36 F; languages ar, ar+en, ar+en+fr, ar+en+de; fees 300-1000 EGP. **14 doctors also take home visits** (the "Home" column: both physiotherapists, plus doctor A of family medicine, internal medicine, paediatrics, geriatrics, cardiology, pulmonology, diabetes, neurology, nutrition, ob-gyn, sports medicine, rheumatology; coverage districts: New Cairo branch `new-cairo nasr-city heliopolis maadi`, Dokki `dokki mohandessin agouza`, Smouha `smouha sidi-gaber`; HOME visit type fee = 1.2 x consultation + 150 EGP surcharge, deposit 200). **Video (mock) visits**: 11 confirmed bookings are flagged "(video)" (psychiatry, nutrition, family medicine, dermatology, diabetes, allergy, infectious diseases, geriatrics, rheumatology, pain management, audiology) and 2 ended sessions (psychiatry, nutrition) exist as `TeleSession` rows (`kiorex.telemedicine` is ON, video provider `mock`).

**Per specialty 3 Kiorex bookings** (108 in total, keys `spNNa/b/c` in `prisma/demo/demo-marketplace-bookings.json`, mirrored byte-identical in both repos) for the demo patients Hoda `+201000001001` ... Rana `+201000001012`: one COMPLETED (with a visit summary and, every second one, a prescription in the patient vault; most carry a review), one CONFIRMED (some with a PAID deposit, some video) and a third that cycles through COMPLETED, CANCELLED (deposit refunded), NO_SHOW (deposit forfeited), PENDING_CLINIC, HELD, CHECKED_IN and CONFIRMED. The table below names which key is which state. Pharmacy and lab orders were NOT added per specialty (they must mirror the partner seeds; the existing 8 + 8 stay).

**How to run it** (idempotent; this is what `scripts/seed-all.sh` does in order): `cd clinics-management && npm run db:seed:demo -w api` (Kiorly), then provider sync (`node scripts/ops-sync.mjs`, or ops console Providers -> Sync), then `cd kiorex-platform && npm run db:seed:demo -w apps/api` (Kiorex). **Kiorly Clinic staff side** (web http://localhost:5174/login or `POST :3010/api/v1/auth/login`), password `Demo@12345`: owner `owner.sp@demo.kiorex.test` (GROUP_ADMIN), `manager.sp@`, `frontdesk1.sp@` / `frontdesk2.sp@` (front desk), `nurse.sp@`, `accountant.sp@`, `callcenter.sp@`, and every doctor as `<key>.sp@demo.kiorex.test` (PHYSICIAN; the key is in the table, e.g. `psychiatrya.sp@demo.kiorex.test`). **Kiorex patient side**: patient web http://localhost:5180 (or Expo web :8081) -> sign in with the demo phone `+201000001001` (Hoda) ... `+201000001012`, OTP `000000` (Passport), then search by specialty; the Kiorex provider id is `demo_l_sp_<key>`. Public Kiorly booking slug: `demo-sp-<key>`. Verified 22 Nov 2026 with `GET /search/providers?specialty=<code>`: all 36 codes return at least 2 providers with `nextSlots` (some codes also return older demo doctors, e.g. paediatrics 5, cardiology 4). The older codes `obstetrics_gynecology` and `physio_therapy` (Nile Care Dr Rania, Dr Mai Hassan) are not folded onto `obgyn` / `physiotherapy` by the provider mapper, so search by those two codes does not show them; the new doctors use the catalogue codes.

| # | Specialty (code) | Doctor (EN / AR) | Gender | Clinic | Home | Langs | Kiorly login / booking slug | Demo bookings (Kiorex) |
|---|---|---|---|---|---|---|---|---|
| 1 | Allergy & Immunology (`allergy_immunology`) | Dr Adel Aziz / د. عادل عزيز | M | New Cairo |  | ar/en | `allergyimmunologya.sp@` / `demo-sp-allergyimmunologya` | `sp01a` done |
|  |  | Dr Amal Fahmy / د. أمل فهمي | F | Dokki |  | ar/en | `allergyimmunologyb.sp@` / `demo-sp-allergyimmunologyb` | `sp01b` confirmed (video), `sp01c` done |
| 2 | Anaesthesiology (`anesthesiology`) | Dr Asmaa Metwally / د. أسماء متولي | F | Dokki |  | ar | `anesthesiologya.sp@` / `demo-sp-anesthesiologya` | `sp02a` done, `sp02b` confirmed |
|  |  | Dr Alaa Refaat / د. علاء رفعت | M | Smouha |  | ar/en/fr | `anesthesiologyb.sp@` / `demo-sp-anesthesiologyb` | `sp02c` cancelled |
| 3 | Audiology & Speech (`audiology`) | Dr Amir Yassin / د. أمير ياسين | M | Smouha |  | ar/en | `audiologya.sp@` / `demo-sp-audiologya` | `sp03a` done |
|  |  | Dr Anas Taha / د. أنس طه | M | New Cairo |  | ar/de/en | `audiologyb.sp@` / `demo-sp-audiologyb` | `sp03b` confirmed (video), `sp03c` no-show |
| 4 | Cardiology (`cardiology`) | Dr Basma Barakat / د. بسمة بركات | F | New Cairo | yes | ar/en | `cardiologya.sp@` / `demo-sp-cardiologya` | `sp04a` done, `sp04b` confirmed |
|  |  | Dr Eman Habib / د. إيمان حبيب | F | Dokki |  | ar/en | `cardiologyb.sp@` / `demo-sp-cardiologyb` | `sp04c` pending clinic |
| 5 | Cardiothoracic Surgery (`cardiothoracic_surgery`) | Dr Ashraf Mounir / د. أشرف منير | M | Dokki |  | ar | `cardiothoracicsurgerya.sp@` / `demo-sp-cardiothoracicsurgerya` | `sp05a` done |
|  |  | Dr Esraa Selim / د. إسراء سليم | F | Smouha |  | ar/en/fr | `cardiothoracicsurgeryb.sp@` / `demo-sp-cardiothoracicsurgeryb` | `sp05b` confirmed, `sp05c` held |
| 6 | Dentistry (`dentistry`) | Dr Farida Shalaby / د. فريدة شلبي | F | Smouha |  | ar/en | `dentistrya.sp@` / `demo-sp-dentistrya` | `sp06a` done, `sp06b` confirmed |
|  |  | Dr Ayman Abbas / د. أيمن عباس | M | New Cairo |  | ar/de/en | `dentistryb.sp@` / `demo-sp-dentistryb` | `sp06c` checked in |
| 7 | Dermatology (`dermatology`) | Dr Bassem Diab / د. باسم دياب | M | New Cairo |  | ar/en | `dermatologya.sp@` / `demo-sp-dermatologya` | `sp07a` done |
|  |  | Dr Emad Kamel / د. عماد كامل | M | Dokki |  | ar/en | `dermatologyb.sp@` / `demo-sp-dermatologyb` | `sp07b` confirmed (video), `sp07c` confirmed |
| 8 | Diabetes & Endocrinology (`diabetes_endocrinology`) | Dr Ghada Okasha / د. غادة عكاشة | F | Dokki | yes | ar | `diabetesendocrinologya.sp@` / `demo-sp-diabetesendocrinologya` | `sp08a` done, `sp08b` confirmed (video) |
|  |  | Dr Hanan Soliman / د. حنان سليمان | F | Smouha |  | ar/en/fr | `diabetesendocrinologyb.sp@` / `demo-sp-diabetesendocrinologyb` | `sp08c` done |
| 9 | Emergency Medicine (`emergency_medicine`) | Dr Essam Gad / د. عصام جاد | M | Smouha |  | ar/en | `emergencymedicinea.sp@` / `demo-sp-emergencymedicinea` | `sp09a` done |
|  |  | Dr Hend Amin / د. هند أمين | F | New Cairo |  | ar/de/en | `emergencymedicineb.sp@` / `demo-sp-emergencymedicineb` | `sp09b` confirmed, `sp09c` cancelled |
| 10 | ENT (`ent`) | Dr Jihan Eissa / د. جيهان عيسى | F | New Cairo |  | ar/en | `enta.sp@` / `demo-sp-enta` | `sp10a` done, `sp10b` confirmed |
|  |  | Dr Fady Maher / د. فادي ماهر | M | Dokki |  | ar/en | `entb.sp@` / `demo-sp-entb` | `sp10c` no-show |
| 11 | internal_medicine (`family_medicine`) | Dr Gamal Rashad / د. جمال رشاد | M | Dokki | yes | ar | `familymedicinea.sp@` / `demo-sp-familymedicinea` | `sp11a` done |
|  |  | Dr Hatem Wahba / د. حاتم وهبة | M | Smouha |  | ar/en/fr | `familymedicineb.sp@` / `demo-sp-familymedicineb` | `sp11b` confirmed (video), `sp11c` pending clinic |
| 12 | Gastroenterology (`gastroenterology`) | Dr Laila Radi / د. ليلى راضي | F | Smouha |  | ar/en | `gastroenterologya.sp@` / `demo-sp-gastroenterologya` | `sp12a` done, `sp12b` confirmed |
|  |  | Dr Lobna Badawy / د. لبنى بدوي | F | New Cairo |  | ar/de/en | `gastroenterologyb.sp@` / `demo-sp-gastroenterologyb` | `sp12c` held |
| 13 | General Surgery (`general_surgery`) | Dr Hazem Ghoneim / د. حازم غنيم | M | New Cairo |  | ar/en | `generalsurgerya.sp@` / `demo-sp-generalsurgerya` | `sp13a` done |
|  |  | Dr Maha Morsy / د. مها مرسي | F | Dokki |  | ar/en | `generalsurgeryb.sp@` / `demo-sp-generalsurgeryb` | `sp13b` confirmed, `sp13c` checked in |
| 14 | Geriatrics (`geriatrics`) | Dr Marwa Saad / د. مروة سعد | F | Dokki | yes | ar | `geriatricsa.sp@` / `demo-sp-geriatricsa` | `sp14a` done, `sp14b` confirmed (video) |
|  |  | Dr Ihab Zahran / د. إيهاب زهران | M | Smouha |  | ar/en/fr | `geriatricsb.sp@` / `demo-sp-geriatricsb` | `sp14c` confirmed |
| 15 | Haematology (`haematology`) | Dr Ismail Younis / د. إسماعيل يونس | M | Smouha |  | ar/en | `haematologya.sp@` / `demo-sp-haematologya` | `sp15a` done |
|  |  | Dr Kamal Darwish / د. كمال درويش | M | New Cairo |  | ar/de/en | `haematologyb.sp@` / `demo-sp-haematologyb` | `sp15b` confirmed, `sp15c` done |
| 16 | Infectious Diseases (`infectious_diseases`) | Dr Mervat Helmy / د. ميرفت حلمي | F | New Cairo |  | ar/en | `infectiousdiseasesa.sp@` / `demo-sp-infectiousdiseasesa` | `sp16a` done, `sp16b` confirmed (video) |
|  |  | Dr Nada Nagy / د. ندى ناجي | F | Dokki |  | ar/en | `infectiousdiseasesb.sp@` / `demo-sp-infectiousdiseasesb` | `sp16c` cancelled |
| 17 | Internal Medicine (`internal_medicine`) | Dr Maged Sharaf / د. ماجد شرف | M | Dokki | yes | ar | `internalmedicinea.sp@` / `demo-sp-internalmedicinea` | `sp17a` done |
|  |  | Dr Nahla Awad / د. نهلة عوض | F | Smouha |  | ar/en/fr | `internalmedicineb.sp@` / `demo-sp-internalmedicineb` | `sp17b` confirmed, `sp17c` no-show |
| 18 | Nephrology (`nephrology`) | Dr Noha Abdelhamid / د. نهى عبد الحميد | F | Smouha |  | ar/en | `nephrologya.sp@` / `demo-sp-nephrologya` | `sp18a` done, `sp18b` confirmed |
|  |  | Dr Marwan El-Banna / د. مروان البنا | M | New Cairo |  | ar/de/en | `nephrologyb.sp@` / `demo-sp-nephrologyb` | `sp18c` pending clinic |
| 19 | Neurology (`neurology`) | Dr Mohab Labib / د. مهاب لبيب | M | New Cairo | yes | ar/en | `neurologya.sp@` / `demo-sp-neurologya` | `sp19a` done |
|  |  | Dr Nabil Qandil / د. نبيل قنديل | M | Dokki |  | ar/en | `neurologyb.sp@` / `demo-sp-neurologyb` | `sp19b` confirmed, `sp19c` held |
| 20 | Neurosurgery (`neurosurgery`) | Dr Nesma Tantawy / د. نسمة طنطاوي | F | Dokki |  | ar | `neurosurgerya.sp@` / `demo-sp-neurosurgerya` | `sp20a` done, `sp20b` confirmed |
|  |  | Dr Rasha Hosny / د. رشا حسني | F | Smouha |  | ar/en/fr | `neurosurgeryb.sp@` / `demo-sp-neurosurgeryb` | `sp20c` checked in |
| 21 | Nutrition & Dietetics (`nutrition`) | Dr Osama Aziz / د. أسامة عزيز | M | Smouha | yes | ar/en | `nutritiona.sp@` / `demo-sp-nutritiona` | `sp21a` done (video) |
|  |  | Dr Rehab Fahmy / د. رحاب فهمي | F | New Cairo |  | ar/de/en | `nutritionb.sp@` / `demo-sp-nutritionb` | `sp21b` confirmed (video), `sp21c` confirmed |
| 22 | Obstetrics & Gynaecology (`obgyn`) | Dr Reham Metwally / د. ريهام متولي | F | New Cairo | yes | ar/en | `obgyna.sp@` / `demo-sp-obgyna` | `sp22a` done, `sp22b` confirmed |
|  |  | Dr Raafat Refaat / د. رأفت رفعت | M | Dokki |  | ar/en | `obgynb.sp@` / `demo-sp-obgynb` | `sp22c` done |
| 23 | Oncology (`oncology`) | Dr Ramy Yassin / د. رامي ياسين | M | Dokki |  | ar | `oncologya.sp@` / `demo-sp-oncologya` | `sp23a` done |
|  |  | Dr Sameh Taha / د. سامح طه | M | Smouha |  | ar/en/fr | `oncologyb.sp@` / `demo-sp-oncologyb` | `sp23b` confirmed, `sp23c` cancelled |
| 24 | Ophthalmology (`ophthalmology`) | Dr Sahar Barakat / د. سحر بركات | F | Smouha |  | ar/en | `ophthalmologya.sp@` / `demo-sp-ophthalmologya` | `sp24a` done, `sp24b` confirmed |
|  |  | Dr Samar Habib / د. سمر حبيب | F | New Cairo |  | ar/de/en | `ophthalmologyb.sp@` / `demo-sp-ophthalmologyb` | `sp24c` no-show |
| 25 | Orthopaedics (`orthopaedics`) | Dr Seif Mounir / د. سيف منير | M | New Cairo |  | ar/en | `orthopaedicsa.sp@` / `demo-sp-orthopaedicsa` | `sp25a` done |
|  |  | Dr Shaimaa Selim / د. شيماء سليم | F | Dokki |  | ar/en | `orthopaedicsb.sp@` / `demo-sp-orthopaedicsb` | `sp25b` confirmed, `sp25c` pending clinic |
| 26 | Paediatrics (`paediatrics`) | Dr Shereen Shalaby / د. شيرين شلبي | F | Dokki | yes | ar | `paediatricsa.sp@` / `demo-sp-paediatricsa` | `sp26a` done, `sp26b` confirmed |
|  |  | Dr Wael Abbas / د. وائل عباس | M | Smouha |  | ar/en/fr | `paediatricsb.sp@` / `demo-sp-paediatricsb` | `sp26c` held |
| 27 | Pain Management (`pain_management`) | Dr Yehia Diab / د. يحيى دياب | M | Smouha |  | ar/en | `painmanagementa.sp@` / `demo-sp-painmanagementa` | `sp27a` done |
|  |  | Dr Zein Kamel / د. زين كامل | M | New Cairo |  | ar/de/en | `painmanagementb.sp@` / `demo-sp-painmanagementb` | `sp27b` confirmed (video), `sp27c` checked in |
| 28 | Physiotherapy (`physiotherapy`) | Dr Soha Okasha / د. سها عكاشة | F | New Cairo | yes | ar/en | `physiotherapya.sp@` / `demo-sp-physiotherapya` | `sp28a` done, `sp28b` confirmed |
|  |  | Dr Suzan Soliman / د. سوزان سليمان | F | Dokki | yes | ar/en | `physiotherapyb.sp@` / `demo-sp-physiotherapyb` | `sp28c` confirmed |
| 29 | Plastic & Cosmetic Surgery (`plastic_surgery`) | Dr Ziad Gad / د. زياد جاد | M | Dokki |  | ar | `plasticsurgerya.sp@` / `demo-sp-plasticsurgerya` | `sp29a` done |
|  |  | Dr Walaa Amin / د. ولاء أمين | F | Smouha |  | ar/en/fr | `plasticsurgeryb.sp@` / `demo-sp-plasticsurgeryb` | `sp29b` confirmed, `sp29c` done |
| 30 | Psychiatry (`psychiatry`) | Dr Yasmine Eissa / د. ياسمين عيسى | F | Smouha |  | ar/en | `psychiatrya.sp@` / `demo-sp-psychiatrya` | `sp30a` done (video), `sp30b` confirmed (video) |
|  |  | Dr Magdy Maher / د. مجدي ماهر | M | New Cairo |  | ar/de/en | `psychiatryb.sp@` / `demo-sp-psychiatryb` | `sp30c` cancelled |
| 31 | Pulmonology & Chest (`pulmonology`) | Dr Sabry Rashad / د. صبري رشاد | M | New Cairo | yes | ar/en | `pulmonologya.sp@` / `demo-sp-pulmonologya` | `sp31a` done |
|  |  | Dr Hesham Wahba / د. هشام وهبة | M | Dokki |  | ar/en | `pulmonologyb.sp@` / `demo-sp-pulmonologyb` | `sp31b` confirmed, `sp31c` no-show |
| 32 | Radiology (`radiology`) | Dr Zeinab Radi / د. زينب راضي | F | Dokki |  | ar | `radiologya.sp@` / `demo-sp-radiologya` | `sp32a` done, `sp32b` confirmed |
|  |  | Dr Doaa Badawy / د. دعاء بدوي | F | Smouha |  | ar/en/fr | `radiologyb.sp@` / `demo-sp-radiologyb` | `sp32c` pending clinic |
| 33 | Rheumatology (`rheumatology`) | Dr Moataz Ghoneim / د. معتز غنيم | M | Smouha | yes | ar/en | `rheumatologya.sp@` / `demo-sp-rheumatologya` | `sp33a` done |
|  |  | Dr Radwa Morsy / د. رضوى مرسي | F | New Cairo |  | ar/de/en | `rheumatologyb.sp@` / `demo-sp-rheumatologyb` | `sp33b` confirmed (video), `sp33c` held |
| 34 | Sports Medicine (`sports_medicine`) | Dr Manal Saad / د. منال سعد | F | New Cairo | yes | ar/en | `sportsmedicinea.sp@` / `demo-sp-sportsmedicinea` | `sp34a` done, `sp34b` confirmed |
|  |  | Dr Nader Zahran / د. نادر زهران | M | Dokki |  | ar/en | `sportsmedicineb.sp@` / `demo-sp-sportsmedicineb` | `sp34c` checked in |
| 35 | Urology (`urology`) | Dr Ragab Younis / د. رجب يونس | M | Dokki |  | ar | `urologya.sp@` / `demo-sp-urologya` | `sp35a` done |
|  |  | Dr Abdallah Darwish / د. عبد الله درويش | M | Smouha |  | ar/en/fr | `urologyb.sp@` / `demo-sp-urologyb` | `sp35b` confirmed, `sp35c` confirmed |
| 36 | Vascular Surgery (`vascular_surgery`) | Dr Lamis Helmy / د. لميس حلمي | F | Smouha |  | ar/en | `vascularsurgerya.sp@` / `demo-sp-vascularsurgerya` | `sp36a` done, `sp36b` confirmed |
|  |  | Dr Salwa Nagy / د. سلوى ناجي | F | New Cairo |  | ar/de/en | `vascularsurgeryb.sp@` / `demo-sp-vascularsurgeryb` | `sp36c` done |

## Seeding staging on AWS (non-production only; written, never applied)
Nothing here deploys anything. A human first deploys the staging stacks and pushes the seed images, then seeds by hand:
1. `enable_demo_seed = true` is set **only** in the staging `terraform.tfvars` (default `false`, prod `false`; a plan with `env = "prod"` and `enable_demo_seed = true` **fails** a precondition, tested offline by `infra/tofu/modules/product-stack/tests/demo_seed_guard.tftest.hcl` via `tofu test`). It creates a container-image Lambda `<product>-staging-demo-seed` in the isolated subnets with DB access and least-privilege IAM (read the DB secret + the runtime secrets, decrypt with the secrets key, nothing else); OpenTofu never invokes it.
2. Build and push the seed image (`apps/api/Dockerfile.seed`, tag = the deploy git sha) to the `<name>-seed` ECR repo, then run `tofu apply` for staging as usual.
3. From the workspace root run `scripts/seed-staging.sh --dry-run` (prints the plan), then `scripts/seed-staging.sh --yes` (order: Passport Cognito users, Kiorly Clinic, Pharmacy, Lab, Kiorex provider sync, Kiorex). `--reset` removes and re-creates the demo records only; `--only lab,kiorex` re-runs selected steps. The script refuses any AWS account other than the staging one. Single product: `tofu output demo_seed_invoke`.
4. Image: `apps/api/Dockerfile.seed` also holds `dist-seed/` (compiled by `npm run build:seed -w api`: `tsc -p tsconfig.seed.json` + JSON specs copied; entrypoints `node dist-seed/prisma/seed.js` and `node dist-seed/prisma/demo/seed-demo.js`, no tsx at run time). The Lambda runs `prisma migrate deploy`, the base seed (plans, market EG, `kx_dev_client`), then the demo seed. Needs `HOME_VISIT_ADDRESS_ENCRYPTION_KEY` to be the same value the API uses (the seed Lambda inherits the stack `env_vars`/`runtime_secrets`).
**Guard (every seed entrypoint, `src/common/demo-seed-guard.ts`; `scripts/demo-seed-guard.ts` in kiorex-account):** the demo seed runs only when `DEMO_SEED_ALLOWED=true` **and** the environment is declared non-production (`KIORLY_ENV` / `KIOREX_ENV` / `ENV_TAG`, the `Env` tag OpenTofu sets; `NODE_ENV` is only a fallback because staging containers run with `NODE_ENV=production`). It fails closed: any variable saying prod/production/live, an unknown environment name, an undeclared environment under `NODE_ENV=production`, a database whose host/name looks like production, or any "allow in prod" override all refuse. It logs a banner (environment + database name, never credentials). Local `npm run` scripts set `DEMO_SEED_ALLOWED=true` for you; `scripts/seed-all.sh` also sets `KIORLY_ENV=local`. Tests: `demo-seed-guard.node.test.ts` (jest/vitest equivalent in platform/account).
Mock providers stay mock on staging (`MODE=mock`, PSP `sandbox-fake`, messaging `log`), so every seeded flow works without real providers. Cognito generates user subs, so the Passport step writes a phone-to-sub map that the Clinic / Pharmacy / Kiorex seeds take as `DEMO_SUB_MAP_JSON` (seed-staging.sh passes it). Families, organisations, invitations, link requests and TOTP of the Passport demo exist only in the local dev IdP DB (the AWS Passport stack is Cognito only): on staging the guardian/org Passport screens are not seeded.
Known limits: Kiorex's provider sync and the Nurse-lab push-back call Kiorly Clinic/Lab over HTTPS and need the egress path HB07 from the isolated subnets (until then those steps warn and the Kiorex data is seeded without the clinic mirror). Seeding Kiorex needs the platform's `KIORLY_CLIENT_KEY/SECRET` runtime secrets. The seed images could not be built in this session (Docker daemon not running): build them once before the first run.

## Q10 additions: record-share consents, care-plan requests, KNLAB01 nurse samples (`prisma/demo/seed-rev23.ts`, spec `demo-nurse-lab.json`)
- **Record-share consents** (`PatientRecordShareConsent`, ids `demo_rsc_*`): every Nurse client has VISIT_SUMMARY + LAB_RESULTS granted (the LAB_RESULTS grant supplies the lab hand-off consent token); Rana (agency, `+201000001012`) **revoked** LAB_RESULTS and Nourhan (solo, `+201000001004`) was never asked, so Nurse -> Lab -> pick them shows the named refusal `LAB_HANDOFF_NO_CONSENT`; Nile Care patients 1..8 have all three scopes granted.
- **Care-plan requests** (Nurse web -> Requests inbox, KN-03): `kx_cp_demo_1` ACCEPTED (-> the real care plan `demo_cp_cp1`, Nabila), `kx_cp_demo_2` RECEIVED (waiting for the agency: Mahmoud `+201000001005`, accept it or decline it), `kx_cp_demo_3` DECLINED with a reason (Rana). Addresses are encrypted like real requests. Kiorex mirrors them as `CarePlanBooking` (CONFIRMED / REQUESTED / REJECTED).
- **KNLAB01 nurse samples** (`ClinicalOrder` + `LabSampleCollection` + tubes, ids `demo_lo_nl1..4`; Nurse web -> Lab samples): nl1 Nabila CBC+KFT collected by Heba at care-plan visit 2, **RELEASED** (report id + secure link, order RESULTS_READY, 8 custody events); nl2 Nabila GLU **AWAITING_VALIDATION** at the lab; nl3 Hoda (solo Mona) CBC handed over, lab status **COLLECTED** (in transit / received); nl4 Dalia TSH **REJECTED_BY_LAB** (`SAMPLE_UNMATCHED`). This seed writes them as HANDED_OFF; the Kiorex demo seed (last step of `scripts/seed-all.sh`) pushes the lab status, custody and report link back through the signed `POST /marketplace/v1/lab-orders/:orderId/status`, exactly as the relay does. Run only this repo's seed and they stay HANDED_OFF.

## Kiorly Team mobile (staff app) demo data: `npm run db:seed:mobile -w api` (after `db:seed:demo`; idempotent, guarded)
Password for every login: `Demo@12345`. The app signs in with `POST /api/v1/auth/login` (see `Docs/MOBILE.md`).
| Plan (normalised) | Org | Logins | What to see in the app |
|---|---|---|---|
| **PRO** (`PRO`) | Nile Care Medical Center (DEMO), id `demo_t_na` | doctor `nadia.na@demo.kiorex.test` · owner `owner.na@` · nurse `nurse.na@` · accountant `accountant.na@` · front desk `frontdesk1.na@` · manager `manager.na@` | schedule + live queue (3 checked-in), prescription **awaiting signature** (`demo_enc_mobile_rx`, Cetirizine), **critical potassium** result to approve (`demo_co_mobile_crit`) + a normal result, open alerts (SOS on a home visit, critical vitals, critical lab), revenue snapshot (owner/accountant) |
| **PRO** (`NURSE_PRO`, edition NURSE) | Demo Home Nursing (Mona), `demo_t_nsolo` | `mona@nurse-demo.kiorly.test` | home-visit round (route, depart/arrive/finish, SOS), lab samples, missed check-in alert |
| **PRO** (`NURSE_AGENCY` maps to ENTERPRISE) | Demo Care Agency | `owner@`, `dispatch@`, `nurse1@nurse-demo.kiorly.test` | agency owner sees every device and every alert |
| **ENTERPRISE** (`ENTERPRISE`) | Kiorly Clinic Group (Demo) | `admin@kiorly.com` | all modules, device management |
| **BASIC** (`LITE`) | Corner Family Clinic (DEMO Basic), `demo_t_bs` | owner `owner.basic@demo.kiorex.test` · doctor `doctor.basic@` · nurse `nurse.basic@` | **upgrade screen** (`PLAN_BELOW_PRO`), but the **safety-alert inbox still works** (one open critical-vitals alert, acknowledge it) |
Entitlement `mobile_staff_app` is a `PlanEntitlement` row per plan (LITE/NURSE_LITE off; PRO/CLINIC/ENTERPRISE/NURSE_PRO/NURSE_AGENCY on), so it also follows the per-tenant override (`TenantEntitlementOverride`) and the Kiorex org-scope OFF. Re-running the seed re-opens the demo alerts; `src/mobile/mobile.integration.test.ts` leaves them open too.
