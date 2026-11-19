# Clinical workflow extensions

Configurable specialty forms, physician shortcuts, safety checks, vitals trends, generated letters, and note locking — built on the existing **SOAP** encounter editor.

## First-visit booking without a full patient chart

Staff can book an appointment for a **new patient** with name + phone only (`provisionalPatient` on `POST /appointments`). That creates a provisional `Patient` (`profileComplete=false`) and stamps `isNewPatientAtBooking` as usual. **Check-in, encounter create, and marking the appointment completed** are blocked until staff finish registration (patient edit with `completeProfile`). Existing patients are unchanged (`profileComplete=true`).

## Template builder

- **API:** `GET/POST /api/v1/clinical/form-templates` (`?clinicId=` on list); `DELETE /api/v1/clinical/form-templates/:id` for clinic-only customs.
- On first use per tenant, the API seeds **built-in EN/AR templates for every `ClinicalSpecialty`** (comprehensive section/field layouts). These are **organization defaults** (`isSystemDefault`, no `clinicId`) and are not editable.
- **Clinic admins** add **custom** templates under **Clinics → [clinic] → Settings** (JSON `sectionsJson`). Use specialty `CUSTOM` plus bilingual labels for ad-hoc specialties.
- **Encounter:** `clinicalTemplateId` + `specialtyFormResponses` (JSON) on `PATCH /api/v1/encounters/:id` — rendered in the encounter UI atop Subjective / Objective / Assessment / Plan.
- **Web:** clinic **Settings** panel lists defaults + customs; legacy `/clinical/templates` redirects to the first clinic’s settings tab.
- **Encounter UI:** template picker lists org defaults + that clinic’s customs; link opens clinic settings for admins.

## Launch specialty templates (CL-04)

| Item | Status |
|---|---|
| CL-04 Built-in templates for 11 launch specialties (content review v2) | **Done** |
| CL-04 Default appointment types + fee factors per specialty at signup | **Done** |
| CL-04 CMO-led advisory board sign-off per template | **Pending** (NH-010) |

- **Launch specialties** (`LAUNCH_SPECIALTIES` in `apps/api/src/clinical/launch-specialty-templates.ts`): dermatology, pediatrics, OB/GYN, orthopedics, ENT, internal medicine, cardiology, psychiatry, ophthalmology, **urology** (new `ClinicalSpecialty.UROLOGY`), dentistry basics.
- **Reviewed** means: the template contains the specialty's `requiredElements` (e.g. OB/GYN `lmp_date` → computed `edd` / `ga`, gravida/para, FHR, fundal height; pediatrics weight/height/head circumference + percentiles + milestones; psychiatry full MSE + suicide risk + PHQ-9/GAD-7; ophthalmology VA/IOP per eye; urology IPSS/PSA/US KUB) — enforced by `cl04-specialty-templates.node.test.ts`. `boardSignOff` stays `null` until a named clinician signs.
- **Field types:** `date` and `computed` (`EDD_FROM_LMP` = LMP + 280 days, `GA_FROM_LMP` = weeks + days) in addition to text/textarea/number/select/checkbox; computed values are stored with the responses.
- **Versioning:** `ClinicalFormTemplate.systemTemplateVersion`; built-in rows below `SYSTEM_TEMPLATE_VERSION` (2) are upgraded in place on first use. Existing field ids are kept, so encounters saved on v1 still render.
- **Signup (ON-01):** each launch specialty seeds its own appointment types (EN + AR) with a fee factor on the market-derived default visit fee (consult ×1, follow-up ×0.5, procedure/scan ×1.5); clinics edit fees afterwards.
- **Web:** the encounter template picker groups templates by specialty (custom specialties last).

## Doctor shortcuts

- **API:** `GET/POST/DELETE /api/v1/clinical/shortcuts`
- Types: `TEXT_EXPAND` (phrase snippets), `RX_SET` (saved medication bundles), `DIAGNOSIS_FAV`, `COPY_LAST_VISIT`.
- Encounter toolbar inserts shortcuts into SOAP fields or applies Rx sets.
- **Last visit:** `GET /api/v1/clinical/patients/:patientId/last-visit?excludeEncounterId=` returns prior finalized SOAP, diagnoses, and medications.

## Diagnosis search (EN / AR)

- **API:** `GET /api/v1/clinical/icd10/search?q=` — matches code, English, Arabic, and keywords.
- **Favorites:** `POST /api/v1/clinical/icd10/favorites` — starred codes surface first for each clinician.
- Catalog seeds on first use (global + per-tenant copy); extend via admin/data explorer later.

## Egyptian drug catalog (CL-01)

Encounter **medications** use brand autocomplete (`GET /clinical/drugs/search`) backed by `DrugProduct` / `ActiveIngredient`. Free-text rows are flagged **Unverified**. See [EGYPT_DRUG_DATABASE.md](./EGYPT_DRUG_DATABASE.md).

## Prescription print, verification QR & WhatsApp share (CL-03)

| Item | Status |
|---|---|
| CL-03 Signed Rx print (brand + ingredient + Arabic instructions) | **Done** |
| CL-03 Pharmacy verification QR (`GET /public/rx/verify/:token`) | **Done** |
| CL-03 "Send to patient" (WhatsApp PDF, approved template) | **Done** — Meta template approval pending (NH-009) |

- **Print:** `POST /api/v1/encounters/:id/prescription/print` (view role) — only for **signed** visits with medications (`409 RX_NOT_SIGNED` / `RX_EMPTY` otherwise). Returns the print model: brand + strength, **active ingredients** from the CL-01 catalog, the doctor's sig as written and an **Arabic instruction line** (`sigToArabic`: OD/BID/TID/QID, q*N*h, PRN, before/after meals, bedtime, "for N days"; unknown English is never guessed — falls back to the catalog `defaultSigAr`). Each call mints a fresh `PrescriptionVerificationToken` (SHA-256 hashed, TTL from market pack `clinicalConfig.rxVerification.tokenTtlDays`, default **14**) and audits `RX_VERIFICATION_ISSUED`.
- **QR:** the printed Rx encodes only `${APP_WEB_URL}/rx/<token>`. Draft prints (`Generate prescription`) carry **no QR** — the old clinic + MRN payload is removed.
- **Verification page:** `GET /api/v1/public/rx/verify/:token` (no auth, `no-store`, `noindex`) + web `/rx/:token`. The response is a projection of the printed Rx (`toVerificationView`): clinic, doctor, signed date, items, and the patient **reduced to initials**. Never MRN, phone, national ID, DOB, diagnoses or notes (tests). Expired / revoked tokens return only `{ status }`; unknown tokens 404.
- **Send to patient:** `POST /api/v1/encounters/:id/prescription/send` (mutate role) queues an `OutboundMessage` with template `prescription_ready` (`name`, `clinic`, `link`) and the bilingual PDF (`GET /public/rx/verify/:token/pdf`, built with the shared `buildBilingualPdf` incl. vector QR) as the WhatsApp **document** link. Goes through MS-03 consent (`MESSAGING_CONSENT_REQUIRED` → 403) and WhatsApp quota; sample patients are never messaged. Audited `RX_SENT_TO_PATIENT`.
- **Web:** encounter medications panel shows a **Signed prescription** card (Print verified prescription · Send to patient) once `signedAt` is set.
- Future: national eRx standards (PRD N.7).

## Vitals & growth charts

- **API:** `GET /api/v1/clinical/patients/:patientId/vitals-series`
- **Web:** patient chart — line charts for BP, HR, SpO₂, weight, height across encounters; **growth** view for pediatric patients when DOB + weight/height exist.

## Clinical document generator

- **API:** `POST /api/v1/clinical/letters` — types: `SICK_LEAVE`, `MEDICAL_REPORT`, `REFERRAL`, `FITNESS_CERTIFICATE`.
- Bilingual **title/body** stored in `ClinicalLetter`; **Generate letter** on the encounter clinical tools panel opens a dialog with bilingual print.

## Signing, locking, and amendments (CL-05)

| Item | Status |
|---|---|
| CL-05 Lock enforced on every write path (API test + source guard) | **Done** |
| CL-05 Append-only amendment trail with re-signature | **Done** |
| CL-05 Sign-off / amend / re-sign usable on a phone (E2E) | **Done** |
| CL-05 Per-tenant lock window setting in the UI | Not built (column only, default 72h) |

- **Finalize** (assigned clinician, or group supervisor/admin) sets `signedAt` / `signedByUserId`. The DTO returns `signedByName` and `noteLocksAt` (when the note locks).
- **`Tenant.encounterAutoLockHours`** (default **72**): once the window passes, the note is locked. The lock is computed on **every write**, not only when someone opens the note (`common/encounter-lock.ts` → `assertEncounterWritable`), and `noteLockedAt` is persisted at that moment.
- **Grace period:** a signed note stays editable (SOAP, vitals, medications) until it locks. Diagnosis/medication removal and document deletion already require a draft or amended note.
- **Locked = read-only everywhere:** encounter PATCH, medications, diagnoses, documents (incl. lab/radiology uploads), encounter delete, the patient-chart document delete/crop, and data-explorer edits of encounters/diagnoses/medications all return **409 `ENCOUNTER_LOCKED`** (`messageKey: errors.encounterLocked`). `cl05-encounter-lock.node.test.ts` fails if new code writes encounter clinical rows without the lock check (exemptions listed with reasons: draft-only check-in paths, visit-fee ledger, scribe on non-finalized notes, patient merge, staging reset).
- **Amend:** `POST /api/v1/encounters/:id/amend` `{ reason }` (≥3 chars; signing clinician or group supervisor/admin only) → status **AMENDED**, lock cleared, and a new **`EncounterAmendment`** row (reason, author name snapshot, time, `wasLocked`). Audited `ENCOUNTER_AMENDED`. Re-signing (`finalize`) stamps `resignedAt`/`resignedByName` on open amendments and starts a fresh lock window. Earlier amendments are never overwritten (legacy `amendReason` columns are kept as "latest" and were backfilled into the table).
- **Web:** the encounter page shows "Signed by … · time", "Editable until … / Locked …", the numbered **amendment history**, an **Amend locked note** dialog (reason required), and **Sign amended note**. Buttons are ≥40px tap targets for phones.

## Safety checks (allergies & interactions)

- Patient **allergies** (chart) are checked when adding medications: `POST /api/v1/clinical/medications/safety-check` returns warnings (does not block save). Responses may include `limitedCheck: true` when matching uses typed names and the Egypt brand-alias list only — not the national drug catalog.
- **Drug–drug** rules in `DrugInteractionRule` (seeded defaults + per-tenant rules).
- Warnings shown in the encounter medication panel before confirm.

## OpenAPI / codegen

From repo root (API running or `apps/api/.env` from `.env.example`):

```bash
npm run openapi:export -w api   # preferred
npm run codegen -w web
```

If export fails locally, refresh clinical paths from a live dev API: `curl -s http://127.0.0.1:3000/docs-json` and merge `/api/v1/clinical/*` into `apps/api/openapi/openapi.json`, then run `codegen`.

## Related docs

- [Clinic_Management_System_RFC.md](./Clinic_Management_System_RFC.md) §6.2.4–6.2.5
- [Clinic_Management_System_PRD.md](./Clinic_Management_System_PRD.md) §12.3 clinical backlog
