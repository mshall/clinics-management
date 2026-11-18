# Clinical workflow extensions

Configurable specialty forms, physician shortcuts, safety checks, vitals trends, generated letters, and note locking — built on the existing **SOAP** encounter editor.

## Template builder

- **API:** `GET/POST /api/v1/clinical/form-templates` (`?clinicId=` on list); `DELETE /api/v1/clinical/form-templates/:id` for clinic-only customs.
- On first use per tenant, the API seeds **built-in EN/AR templates for every `ClinicalSpecialty`** (comprehensive section/field layouts). These are **organization defaults** (`isSystemDefault`, no `clinicId`) and are not editable.
- **Clinic admins** add **custom** templates under **Clinics → [clinic] → Settings** (JSON `sectionsJson`). Use specialty `CUSTOM` plus bilingual labels for ad-hoc specialties.
- **Encounter:** `clinicalTemplateId` + `specialtyFormResponses` (JSON) on `PATCH /api/v1/encounters/:id` — rendered in the encounter UI atop Subjective / Objective / Assessment / Plan.
- **Web:** clinic **Settings** panel lists defaults + customs; legacy `/clinical/templates` redirects to the first clinic’s settings tab.
- **Encounter UI:** template picker lists org defaults + that clinic’s customs; link opens clinic settings for admins.

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

## Signing, locking, and amendments

- **Finalize** sets `signedAt` / `signedByUserId`.
- **`Tenant.encounterAutoLockHours`** (default **72**) — after finalize, when the window elapses, `noteLockedAt` is set and the chart is read-only.
- **Grace period:** finalized encounters remain editable until auto-lock.
- **`POST /api/v1/encounters/:id/amend`** with `{ reason }` sets status **AMENDED**, stores reason, author, timestamp; clears lock for correction, then re-finalize.

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
