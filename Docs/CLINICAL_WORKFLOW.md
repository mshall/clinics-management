# Clinical workflow extensions

Configurable specialty forms, physician shortcuts, safety checks, vitals trends, generated letters, and note locking — built on the existing **SOAP** encounter editor.

## Template builder

- **API:** `GET/POST /api/v1/clinical/form-templates`
- Each template is tied to a `ClinicalSpecialty` (dental, OB/GYN, pediatrics, physio, etc.) and stores **`sectionsJson`**: an array of sections and fields (text, textarea, number, select, checkbox).
- Templates can be **published** (org-wide) or owned by a physician.
- **Encounter:** `clinicalTemplateId` + `specialtyFormResponses` (JSON) on `PATCH /api/v1/encounters/:id` — rendered in the encounter UI atop Subjective / Objective / Assessment / Plan.
- **Web:** `/clinical/templates` — template builder (no code deploy for new specialty layouts).
- **Encounter UI:** template picker and dynamic fields above SOAP; saved with the encounter. Sidebar **Clinical templates** when Encounters is enabled.

## Doctor shortcuts

- **API:** `GET/POST/DELETE /api/v1/clinical/shortcuts`
- Types: `TEXT_EXPAND` (phrase snippets), `RX_SET` (saved medication bundles), `DIAGNOSIS_FAV`, `COPY_LAST_VISIT`.
- Encounter toolbar inserts shortcuts into SOAP fields or applies Rx sets.
- **Last visit:** `GET /api/v1/clinical/patients/:patientId/last-visit?excludeEncounterId=` returns prior finalized SOAP, diagnoses, and medications.

## Diagnosis search (EN / AR)

- **API:** `GET /api/v1/clinical/icd10/search?q=` — matches code, English, Arabic, and keywords.
- **Favorites:** `POST /api/v1/clinical/icd10/favorites` — starred codes surface first for each clinician.
- Catalog seeds on first use (global + per-tenant copy); extend via admin/data explorer later.

## Structured prescriptions & QR

- Existing **Generate prescription** image flow (`generatePrescriptionPng`) now embeds a **QR code** (clinic name, address, phone, MRN, date) for verification at pharmacy.
- Future: signed JSON payload / national eRx standards (PRD N.7).

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

- Patient **allergies** (chart) are checked when adding medications: `POST /api/v1/clinical/medications/safety-check` returns warnings (does not block save).
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
