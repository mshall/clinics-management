# Front desk & patient flow

Speed tools for reception: **global patient search**, **one-step check-in**, **live clinic board**, and **chart-header alerts** visible on patient, appointment, and encounter screens.

**Migration:** `20261113213041_front_desk_flow`  
**API module:** `FrontDeskModule` (`/api/v1/front-desk/*`)  
**Web:** header search (⌘K / Ctrl+K), `/front-desk/board`, `/front-desk/waiting-room`, quick check-in on appointment detail

---

## Global patient search

| Item | Detail |
|------|--------|
| UI | Header button **Find patient** on every authenticated screen (`GlobalPatientSearch` in app shell) |
| Shortcut | **⌘K** (macOS) / **Ctrl+K** (Windows/Linux) |
| Query | Phone, national ID, MRN, or name (reuses tenant-scoped patient list search) |
| API | `GET /api/v1/front-desk/patients/search?q=` → paginated patient rows (max 8) |
| Navigation | Selecting a row opens **Patient 360** (`/patients/:id`) |

---

## Quick check-in (&lt; 30 seconds)

Goal: move appointment → **CHECKED_IN** with arrival time, queue ticket, optional room, and same-step revenue.

| Field / behaviour | Detail |
|-------------------|--------|
| Status | Sets `CHECKED_IN` (existing enum) |
| `checkedInAt` | Server timestamp at check-in |
| `queueTicketNumber` | Per clinic, per calendar day, monotonic (starts at 1 each day) |
| `roomLabel` | Optional; can pre-fill from appointment |
| Payment | Optional `paymentAmount` + `currency` → creates **POSTED** `revenueEntry` (`VISIT`) linked to the appointment |
| UI | **Quick check-in** card on **Appointments → detail**; after check-in shows ticket # and time |
| API | `POST /api/v1/front-desk/appointments/:id/check-in` body: `{ paymentAmount?, roomLabel?, currency? }` |

Staff with **Appointments** nav access can use check-in and the board (receptionist, nurse, call center, clinic roles).

---

## Live clinic board & waiting-room screen

| Item | Detail |
|------|--------|
| Board UI | **Appointments → Front desk board** (`/front-desk/board`) — clinic picker, 12s poll |
| Waiting queue | Checked-in today: patient name, MRN, clinician, ticket #, wait minutes |
| Rooms | From clinic `frontDeskRoomLabels` JSON (default Room 1–3); **Free** vs **In use** from today’s room assignments |
| Call ticket | `POST /api/v1/front-desk/call-ticket` `{ clinicId, ticketNumber }` updates `lastCalledTicketNumber` / `calledAt` on appointments |
| Waiting-room TV | **Open waiting-room screen** (new tab) → `/front-desk/waiting-room?clinicId=` — large **Now serving** + queue count |
| API | `GET /api/v1/front-desk/board?clinicId=` |

Configure room names under **Clinics & branches → clinic detail → Settings → Exam rooms** (group admin, clinic admin, or branch manager). Changes apply immediately to the live board and waiting-room screen for that clinic.

---

## Patient chart header alerts

Badges load once per patient id and appear beside the title on:

- Patient detail (`PatientChartAlerts`)
- Appointment detail (when patient is linked)
- Encounter detail

| Badge source | Logic (high level) |
|--------------|-------------------|
| Allergies | Active patient allergies count &gt; 0 |
| Balance owed | Open patient ledger / invoice balance &gt; 0 |
| VIP | `Patient.isVip` |
| Chaperone | `Patient.needsChaperone` |

API: `GET /api/v1/front-desk/patients/:id/header-alerts` → `{ badges: [{ code, label, severity }] }`

Edit VIP / chaperone on the patient record (patient update DTO).

---

## RBAC & nav

- Global search: any signed-in staff user (header is outside route gates).
- Board, check-in, search API: tenant JWT; patient search respects existing patient list RBAC via `PatientsService`.
- Sidebar: **Front desk board** sub-link under **Appointments** (hidden for physician “My appointments” nav).

---

## Related docs

- [PATIENT_360_AND_SCHEDULING.md](./PATIENT_360_AND_SCHEDULING.md) — appointments, types, waitlist
- [CLINICAL_WORKFLOW.md](./CLINICAL_WORKFLOW.md) — encounter chart tools
- [Clinic_Management_System_RFC.md](./Clinic_Management_System_RFC.md) — API conventions
- [Test_Data_Users.md](./Test_Data_Users.md) — demo logins for reception workflows

---

## Local verification

```bash
npm run db:ensure
npm run dev
```

1. Sign in as receptionist (`receptionist@drahmedshall.com` / `demo`).
2. Press **⌘K**, search by MRN or name, open patient.
3. Open today’s appointment → **Check in & print ticket** with optional payment → note ticket #.
4. Open **Front desk board** → see queue, call ticket, open waiting-room tab.
5. Open patient / encounter → confirm allergy / VIP badges when seeded.
