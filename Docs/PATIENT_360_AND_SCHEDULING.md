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
| Appointment types (duration, fee, colour) | `GET/POST /api/v1/scheduling/appointment-types` | Use `appointmentTypeId` when booking |
| Doctor availability template | `GET/PUT /api/v1/scheduling/availability` | Admin JSON (weekly `weekJson`, `blockedJson`) |
| HR leave blocks | `GET /api/v1/scheduling/clinicians/:id/leave-blocks` | From approved `LeaveRequest` |
| Recurring / physio series | `POST /api/v1/scheduling/series` | API creates N linked appointments |
| Waitlist | `GET/POST /api/v1/scheduling/waitlist` | First waitlist entry marked `OFFERED` on cancel |
| No-show + deposit flag | `POST /api/v1/scheduling/appointments/:id/no-show` | After 3 no-shows → `requiresAppointmentDeposit` |
| Double booking | `allowDoubleBook` on create | Existing overlap dialog + flag |
| Follow-up from visit | `followUpWeeks` on encounter save/finalize | Encounter SOAP → pending booking |

## Migration

`20261113212611_patient_360_scheduling` — enums, patient scheduling tables, encounter follow-up fields.
