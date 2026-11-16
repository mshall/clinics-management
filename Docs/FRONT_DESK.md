# Front desk & patient flow

Speed tools for reception: **global patient search**, **one-step check-in**, **live clinic board**, and **chart-header alerts** visible on patient, appointment, and encounter screens.

**Migrations:** `20261113213041_front_desk_flow`, `20261115090000_visit_collection_channels`, `20261115103000_appointment_queue_flow`  
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

Goal: move appointment → **CHECKED_IN** with arrival time, queue ticket, **`queueStage = WAITING`** (waiting area — exam rooms stay free), and same-step revenue.

| Field / behaviour | Detail |
|-------------------|--------|
| Status | Sets `CHECKED_IN`, `checkedInAt`, daily `queueTicketNumber`, and `queueStage = WAITING` (same as **Check in & print ticket** and saving status **Checked in** on the appointment) |
| Encounter | **Always** opens a **draft** encounter linked to the appointment (`openEncounterId` on check-in response and `GET /appointments/:id` when `CHECKED_IN`). Idempotent: legacy check-ins without a draft are healed on the next read or save. No exam room until **Start visit** — patient stays on the **waiting** list. |
| `checkedInAt` | Server timestamp at check-in |
| `queueTicketNumber` | Per clinic, per calendar day, monotonic (starts at 1 each day) |
| `queueStage` | Set to **`WAITING`**; `roomLabel` cleared (no occupancy until visit starts) |
| `preferredRoomLabel` | Optional body field `roomLabel` on check-in API — **hint** for auto-assign at **Start visit** |
| Payment | Optional `paymentAmount` + `currency` + `visitCollection` → **POSTED** `revenueEntry` (`VISIT`) |
| UI | **Quick check-in** on **Appointments → detail**; preferred exam room dropdown from clinic **Exam rooms** |
| API | `POST /api/v1/front-desk/appointments/:id/check-in` body: `{ paymentAmount?, roomLabel?, currency?, visitCollection? }` — response includes `openEncounterId`. Saving appointment status **Checked in** (`PATCH /appointments/:id` or `PATCH /appointments/:id/status`) runs the same encounter step. |

Staff with **Appointments** nav access can use check-in and the board (receptionist, nurse, call center, clinic roles).

---

## Visit payment collection

When staff collect a fee at **check-in** (appointment) or when **creating an encounter** with a visit fee:

| Method | UI |
|--------|-----|
| **Cash on visit** | Default; posts to revenue with `collectionMode=CASH_ON_VISIT` |
| **Money transfer** | Choose **InstaPay**, **Fawry**, or an **organization payment channel** (Admin → **Organization & settings** → **Payment channels**, group admin). Account/mobile hints show for custom channels. Enter **transaction ID** (format-validated for market methods; generic min length for custom channels). Posts `RevenueEntry` and enqueues **ETA e-receipt** when fiscal is configured. |

API: `visitCollection` on `POST /api/v1/front-desk/appointments/:id/check-in` and `POST/PATCH /api/v1/encounters` when `visitFeeAmount` / `paymentAmount` > 0 (only when actually collecting — not when raising the fee after check-in payment).

When the **encounter fee** is raised above what was collected at check-in, the API posts the difference as a **`RECEIVABLE`** visit-fee row (not counted in revenue totals or cash close until collected). Use **`POST /api/v1/front-desk/encounters/:encounterId/collect-visit-balance`** (or the **Collect balance** card on the appointment / encounter) to apply payment method and queue the e-receipt on that same row. Collection is allowed on **finalized** encounters while a `RECEIVABLE` row exists; duplicate collect attempts return **409**.

A **lower** fee after payment uses **`reducePostedRevenueNetWithFiscal`**: partial return when the sale was already submitted; if the sale is still **PENDING**, the pending document is cancelled and a new sale is queued at the reduced amount on the same revenue row.

## Live clinic board & waiting-room screen

### Automated visit flow

| Step | What happens |
|------|----------------|
| 1. Check-in | `WAITING` queue stage; **draft encounter** created; optional **preferred exam room** (not occupied yet). |
| 2. Call | `CALLED` + TV **Now serving** ticket. |
| 3. Start visit | `POST /api/v1/front-desk/appointments/:id/start-visit` or create/link an **encounter** → `IN_EXAM`, **auto-assign** exam room (preferred → physician default → first free room). |
| 4. Finalize encounter | Clears `roomLabel`, sets linked appointment to **COMPLETED** (`endsAt` = finalize time); room shows **Free**. Staff cannot mark the appointment **Completed** in the UI while an open (draft/amended) encounter is still linked — finalize the encounter first. |

Room assignment order: **preferredRoomLabel** → physician **`defaultExamRoomLabel`** (Clinics → Doctors) → first free label from **Exam rooms** settings.

| Item | Detail |
|------|--------|
| Board UI | **Appointments → Front desk board** — waiting list + in-exam list, 15s poll |
| Waiting queue | `queueStage` **WAITING** or **CALLED** (checked-in today) |
| In exam | `queueStage` **IN_EXAM** with assigned `roomLabel` |
| Rooms | **In use** only while a patient is **IN_EXAM** with that `roomLabel` |
| Call ticket | `POST /api/v1/front-desk/call-ticket` |
| Start visit | `POST /api/v1/front-desk/appointments/:id/start-visit` |
| Waiting-room TV | `/front-desk/waiting-room?clinicId=` |
| API | `GET /api/v1/front-desk/board?clinicId=` |

Configure room names under **Clinics & branches → clinic detail → Settings → Exam rooms** (group admin, clinic admin, or branch manager). There is no separate Save control:

| Action | Behaviour |
|--------|-----------|
| **Rename** | Edit → **Done** — saves immediately if the name changed |
| **Add** | Enter a name → **Add** → confirm in the dialog — saves on confirm |
| **Remove** | Trash → confirm in the dialog — saves on confirm |

Updates apply to the live board and waiting-room screen for that clinic after each successful action.

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
3. Open today’s appointment → **Check in** (optional preferred room / payment) → ticket # and **WAITING** on **Visit flow** card.
4. **Front desk board** → **Call** → **Start visit** (or start encounter from appointment) → patient moves to **In exam** with auto room.
5. **Clinics → Doctors** — set **Default exam room** per physician (optional).
6. Finalize encounter → room **Free** on board; appointment **Completed**.
7. Open waiting-room tab for TV display; confirm chart header alerts (allergy / VIP) when seeded.
