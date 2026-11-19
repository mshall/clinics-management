# Clinic platform capabilities map

Master checklist for **procedures, billing, messaging, reports, setup, and clinic AI**. Each row shows **status**, **data/API**, and **what’s next** for production hardening.

**GT-06 (Nov 2026):** statuses aligned with launch build (§5 of `kiorly-cursor-build-sequence.md`). Hubs: [PLANS_AND_ENTITLEMENTS.md](./PLANS_AND_ENTITLEMENTS.md) · [BILLING_AND_CREDITS.md](./BILLING_AND_CREDITS.md) · [KIOREX_CONNECTOR.md](./KIOREX_CONNECTOR.md).

**Migration:** `20261114160000_clinic_platform_wave`

| Legend | Meaning |
|--------|---------|
| **Shipped** | Usable in app + API today |
| **Foundation** | Schema + API; UI partial or provider stub |
| **Planned** | Documented; not yet in code |

---

## 1. Procedures & operations

| Requirement | Status | Notes |
|-------------|--------|--------|
| Status pipeline booked → pre-op → in progress → recovery → discharged | **Shipped** | `OperationStatus` extended; legacy `SCHEDULED`/`COMPLETED` map to booked/discharged; `PATCH /operations/:id/status` one step at a time |
| “How did they find us?” on operation create (updates patient profile) | **Shipped** | Mandatory on `POST /operations`; same acquisition fields as patient/encounter create |
| Pre-op checklist (tablet) | **Foundation** | `GET /operations/:id/pre-op-checklist`, `POST .../:itemId/complete`; default EN/AR items |
| Consent on tablet | **Foundation** | Upload `CONSENT` via existing operation documents API; checklist includes consent line |
| Operation note template | **Foundation** | `PATCH /operations/:id/operation-note` JSON; pair with clinical templates in UI |
| Supplies used | **Foundation** | `POST /operations/:id/supplies` |
| Installment schedule (down payment / paid amount) | **Foundation** | `POST /operations/:id/installments` rows `{ dueOn, amount }` |
| Post-surgery documents on discharged ops | **Shipped** | `POST /operations/:id/documents` with `kind=POST_SURGERY` after discharge; operations detail + patient 360 |

---

## 2. Billing at the front desk

| Requirement | Status | Notes |
|-------------|--------|--------|
| Service & price list (codes, effective dates) | **Foundation** | `ServiceCatalogItem` + `ServicePrice`; `GET/POST /billing/catalog` |
| Contract prices per payer company | **Foundation** | `PayerCompany`, `ContractServicePrice`; resolver in `BillingService.resolvePrice` |
| Invoice lines: qty, price, discount, tax | **Foundation** | `InvoiceLine` columns; manager flag when discount &gt; 15% |
| Check-in collection (cash / InstaPay / Fawry) | **Shipped** | Front desk check-in; validates transfer refs; revenue via **`postRevenue` only** (no ETA) |
| Draft encounter on check-in | **Shipped** | Quick check-in, status **Checked in**, and `GET /appointments/:id` ensure a **DRAFT** encounter linked to the appointment (`openEncounterId`) |
| Split payment cash + card | **Shipped** | MN-06 — `POST /billing/split-payments` + installments |
| Refunds, credit notes, deposits, packages | **Shipped** | MN-01 — refunds via `postRevenue`; packages/deposits as liabilities |
| Daily cash close per cashier/branch | **Shipped** | MN-03 — `CashierShift` open/close/Z-report + owner WhatsApp |
| Doctor commission rules & statements | **Shipped** | MN-02 — revenue-share engine + statements |
| Insurer billing, co-pay, pre-auth, TPA claims | **Shipped** | MN-05 — `ClaimBatch` / remittance match / B2B payer outbox; co-pay on `ContractServicePrice`; pre-auth foundation |
| **Egypt: ETA e-receipts** | **Out of scope** | FD-02 — Kiorly never submits to ETA; clinics issue their own receipts |
| **Receipt devices (multi-market)** | **Retired for ETA** | Fiscal device UI retained only where a market pack still uses non-ETA providers; EG uses clinic-issued receipts |
| **Egypt: data protection consent** | **Shipped (SC-03)** | `ConsentPolicy.require`; `GET /patients/:id/consents`; check-in + Kiorex capture — [PATIENT_CONSENT.md](./PATIENT_CONSENT.md) |

---

## 3. Patient messages (clinic-originated)

| Requirement | Status | Notes |
|-------------|--------|--------|
| WhatsApp/SMS templates (EN/AR) | **Foundation** | `GET /messaging/templates` seeds confirm, 24h/2h reminders, results ready |
| Automated reminder queue | **Shipped** | Meta Cloud templates + webhooks ([MESSAGING_WHATSAPP.md](./MESSAGING_WHATSAPP.md)); delivery in patient/appointment UI |
| Confirm/cancel replies | **Shipped** | MS-02 quick replies + waitlist on cancel ([MESSAGING_WHATSAPP.md](./MESSAGING_WHATSAPP.md)) |
| Messaging consent / STOP | **Shipped** | MS-03 transactional vs marketing + PDPL opt-out ([MESSAGING_CONSENT.md](./MESSAGING_CONSENT.md)) |
| Transactional email (trial, invoices, security) | **Shipped** | SES + bilingual templates; DKIM/SPF/DMARC gate ([MESSAGING_EMAIL.md](./MESSAGING_EMAIL.md)); NH-016 for DNS |
| Recall / campaigns (check-up, lapsed, birthday) | **Foundation** | `GET /messaging/recall-campaigns`; tie to `Patient.acquisitionChannel` in next slice |
| Booking attribution & new-patient rule (CR-02) | **Done** | See [BOOKING_ATTRIBUTION.md](./BOOKING_ATTRIBUTION.md) |
| Post-visit satisfaction → doctor score | **Foundation** | `SatisfactionSurveyResponse` table; trigger on encounter finalize (next) |

---

## 4. Reports for the owner

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Today** on dashboard (live) | **Shipped** | `GET /dashboards/today?clinicId=` |
| Period KPIs, P&L, clinic breakdown | **Shipped** | Existing dashboard + reports |
| No-show rate, utilization, revenue/doctor-hour | **Shipped** | RP-01 — `GET /reports/operations` |
| AR aging, payouts, branch P&L | **Phase 1b** | RP-04 (post-launch) |
| Excel/PDF export & scheduled email | **Done** | RP-02 — `GET /reports/:key/export`, weekly schedule |

---

## 5. Setup, trust & polish

| Requirement | Status | Notes |
|-------------|--------|--------|
| Onboarding wizard & Excel import | **Shipped** | ON-04/ON-05 — checklist + Excel import |
| MFA (TOTP) | **Shipped** | SC-04 — TOTP + WhatsApp OTP for physicians; grace then enforce |
| Permissions screen per role | **Shipped** | Admin → org/clinic nav tabs (`org-rbac-panel`, `clinic-nav-tabs-panel`) |
| Thermal/A4 bilingual print | **Partial** | A4 bilingual shipped; thermal polish in UX-04 (Phase 1b) |
| Tablet layout / offline schedule | **Shipped** | UX-01 PWA + offline today; UX-02 mobile bottom nav |
| Incident reporting / GAHAR | **Foundation** | `ClinicalIncident` table |

---

## 6. Clinic intelligence (honest labels — AI-03)

| Feature | Label in product | Backing | Status | API |
|---------|------------------|---------|--------|-----|
| **Kiorly AI assistant** | AI badge | Language model (market `AiProvider`) | **Shipped** | `POST /assistant/chat` — flag `ai_assistant` |
| **Smart summary (pre-visit)** | No AI badge | Rule template from chart rows | **Shipped** | `GET /clinic-ai/patients/:id/pre-visit-summary` |
| **No-show risk estimate** | No AI badge — chip says "rule-based" | Formula (`noShowCount`, deposit, lead time) | **Done** (FS-05: chip on appointments, nightly refresh, deposit / reminder suggestion) | `AppointmentDto.noShowRisk`; `POST /clinic-ai/appointments/refresh-no-show-risk` |
| **Chart scribe (workflow)** | AI scribe add-on | Clinician-approve draft; audio STT stub | **Shipped** (AI-02/AI-04) | `POST /clinic-ai/encounters/:id/scribe/*`; meter `AI_SCRIBE_MINUTES` |

Copy registry: [AI_HONEST_LABELS.md](./AI_HONEST_LABELS.md). The role assistant is gated by layered flag `ai_assistant` — see [FEATURE_FLAGS.md](./FEATURE_FLAGS.md).

---

## Related docs

- [EGYPT_GO_LIVE.md](./EGYPT_GO_LIVE.md) · [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md)
- [FRONT_DESK.md](./FRONT_DESK.md) · [PATIENT_360_AND_SCHEDULING.md](./PATIENT_360_AND_SCHEDULING.md) · [CLINICAL_WORKFLOW.md](./CLINICAL_WORKFLOW.md)
- [Clinic_Management_System_PRD.md](./Clinic_Management_System_PRD.md) · [PRODUCT_EPIC_ROADMAP.md](./PRODUCT_EPIC_ROADMAP.md)

---

## Local verification

```bash
npm run db:ensure
npm run dev
```

1. Create operation → advance status through pre-op → discharged (collect balance on discharge).
2. Check in with cash or InstaPay/Fawry (valid reference format) → revenue posts via `postRevenue` (no ETA queue).
3. `POST /api/v1/billing/catalog` then collect a visit payment from the front desk.
4. Record data-protection consent for a patient.
5. `GET /api/v1/dashboards/today`
6. `GET /api/v1/clinic-ai/patients/:id/pre-visit-summary`
