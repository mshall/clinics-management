# Screen inventory (source-derived)

Direct routes from `apps/web/src/app/router.tsx` (current main; checked 2026-11-17).

| Group | Screen | Route |
|---|---|---|
| Core | Dashboard | `/` |
| Clinical | Patients | `/patients` |
| Clinical | Patient detail | `/patients/:id` |
| Clinical | Encounters | `/encounters` |
| Clinical | Encounter detail | `/encounters/:id` |
| Clinical | Clinical templates | `/clinical/templates` |
| Scheduling | Appointments | `/appointments` |
| Scheduling | Appointment detail | `/appointments/:id` |
| Scheduling | Front desk board | `/front-desk/board` |
| Scheduling | Waiting room display | `/front-desk/waiting-room` |
| Operations | Operations | `/operations` |
| Operations | Clinics | `/clinics` |
| Operations | Clinic detail | `/clinics/:id` |
| Finance | Expenses | `/expenses` |
| Finance | Revenue | `/revenue` |
| Finance | Doctor revenue | `/doctor-revenue` |
| People | HR | `/hr` |
| People | Employee detail | `/hr/employees/:id` |
| People | Employee profile | `/hr/employees/:id/profile` |
| Analytics | Reports | `/reports` |
| Administration | Admin | `/admin` |
| Administration | Support | `/customer-support` |
| Administration | Profile | `/profile` |
| Administration | Guide | `/guide` |
| Platform | Platform overview | `/platform` |
| Platform | Platform markets | `/platform/markets` |
| Platform | Platform organizations | `/platform/organizations` |
| Platform | Platform users | `/platform/users` |
| Platform | Platform clinics | `/platform/clinics` |
| Platform | Platform insights | `/platform/insights` |
| Authentication | Sign in | `/login` |

## Nested panels, actions and important screen states

| Group | Subview | Parent route |
|---|---|---|
| Scheduling | Calendar / week | `/appointments` |
| Scheduling | Calendar / day | `/appointments` |
| Scheduling | Calendar / month | `/appointments` |
| Scheduling | Book appointment dialog | `/appointments` |
| Scheduling | Appointment overlap confirmation | `/appointments` |
| Scheduling | Quick check-in | `/front-desk/board` |
| Finance | Collect outstanding visit balance | `/front-desk/board` |
| Clinical | Patient 360 / overview | `/patients/:id` |
| Clinical | Patient 360 / timeline | `/patients/:id` |
| Clinical | Patient 360 / allergies | `/patients/:id` |
| Clinical | Patient 360 / documents | `/patients/:id` |
| Clinical | Patient 360 / clinical photos | `/patients/:id` |
| Clinical | Patient 360 / family | `/patients/:id` |
| Clinical | Patient duplicate merge | `/patients/:id` |
| Clinical | Encounter / SOAP | `/encounters/:id` |
| Clinical | Encounter / prescriptions | `/encounters/:id` |
| Clinical | Encounter / documents | `/encounters/:id` |
| Clinical | Specialty consultation form | `/encounters/:id` |
| Clinical | Clinical letter | `/encounters/:id` |
| Operations | Clinic / doctors | `/clinics/:id` |
| Operations | Clinic / hours | `/clinics/:id` |
| Operations | Clinic / rooms | `/clinics/:id` |
| Operations | Clinic / currency | `/clinics/:id` |
| Operations | Clinic / fiscal devices | `/clinics/:id` |
| Operations | Clinic / clinical templates | `/clinics/:id` |
| Finance | Invoices / issue | `/revenue` |
| Finance | Invoices / preview | `/revenue` |
| Finance | Payment channels | `/admin` |
| Finance | Financial / ETA receipts | `/admin` |
| People | HR / attendance | `/hr` |
| People | HR / leave | `/hr` |
| People | Employee onboarding | `/hr` |
| Administration | Feature flags | `/admin` |
| Administration | Users & roles | `/admin` |
| Administration | Integration clients | `/admin` |
| Administration | Integration failures | `/admin` |
| Administration | Security / MFA | `/profile` |
| Assistant | AI assistant | `/` |
| States | Empty states | `/` |
| States | Confirm/delete dialogs | `/` |
| States | Loading/error states | `/` |
