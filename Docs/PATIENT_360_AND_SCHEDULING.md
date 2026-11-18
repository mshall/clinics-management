# Patient 360 & advanced scheduling

## Patient chart

| Feature | API | Web |
|--------|-----|-----|
| One-page summary | `GET /api/v1/patients/:id/summary` | `Patient360Summary` on patient detail |
| Active problems (structured) | `GET/POST /api/v1/patients/:id/active-problems` | `PatientActiveProblemsSection` |
| Allergies (structured) | Existing `PatientAllergy` | Existing section in summary + sidebar |
| Timeline (filtered) | `GET /api/v1/patients/:id/timeline?types=` | `PatientTimeline` |
| Family links | `GET/POST/DELETE .../family-links` | `PatientFamilyPanel` |
| Merge duplicate | `POST .../merge` | `PatientMergeWizard` |
| Clinical photo gallery | `GET .../clinical-photos` | `PatientClinicalPhotoGallery` (metadata; upload wiring next) |

## Scheduling

| Feature | API | Web |
|--------|-----|-----|
| Appointment types (duration, fee, colour, buffers, marketplace rules) | `GET/POST/PATCH /api/v1/scheduling/appointment-types` | `ClinicAppointmentTypesPanel` on clinic settings |
| Per-clinician duration/fee overrides | `GET/PUT /api/v1/scheduling/clinicians/:id/type-overrides` | `ClinicianTypeOverridesPanel` on clinic doctors tab |
| Doctor availability template | `GET/PUT /api/v1/scheduling/availability` | Admin JSON (weekly `weekJson` v1 + `blockedJson`, clinic timezone) |
| Bookable slots (KX-03) | `GET /api/v1/scheduling/slots?clinicId&clinicianId&typeId&from&to&channel` | Appointment book panel uses server slot engine |
| HR leave blocks | `GET /api/v1/scheduling/clinicians/:id/leave-blocks` | From approved `LeaveRequest` |
| Recurring / physio series | `POST /api/v1/scheduling/series` | API creates N linked appointments |
| Waitlist | `GET/POST /api/v1/scheduling/waitlist` | First waitlist entry marked `OFFERED` on cancel |
| No-show + deposit flag | `POST /api/v1/scheduling/appointments/:id/no-show` | After 3 no-shows → `requiresAppointmentDeposit` |
| Double booking | `allowDoubleBook` on create | Existing overlap dialog + flag |
| Follow-up from visit | `followUpWeeks` on encounter save/finalize | Encounter SOAP → pending booking |

## FS-01 appointment type fields

- `bufferBeforeMin` / `bufferAfterMin` — expand clinician conflict checks; stored on the type (not overridden per doctor).
- `requiresRoom` — booking must include `roomLabel` when true.
- `marketplaceBookable`, `minNoticeMinutes`, `maxDaysAhead`, `depositAmount`, `newPatientOnly` — channel and booking window rules (Kiorex/marketplace wiring follow-up).
- `ClinicianAppointmentTypeOverride` — optional `durationMinutes` and `feeAmount` per clinician + type.

Availability `weekJson` **version 1** shape: `{ "version": 1, "timezone": "<IANA>", "days": [{ "dow": 0-6, "slots": [{ "start": "HH:mm", "end": "HH:mm" }] }] }`. Legacy array-shaped rows are normalized on migrate and on `PUT /availability`.

## Migration

- `20261113212611_patient_360_scheduling` — enums, patient scheduling tables, encounter follow-up fields.
- `20261117200000_fs01_scheduling_engine` — FS-01 columns, override table, weekJson normalization.
