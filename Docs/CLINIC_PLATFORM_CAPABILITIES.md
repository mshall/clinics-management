# Clinic platform capabilities map

Master checklist for **procedures, billing, messaging, reports, setup, and clinic AI**. Each row shows **status**, **data/API**, and **what’s next** for production hardening.

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
| Pre-op checklist (tablet) | **Foundation** | `GET /operations/:id/pre-op-checklist`, `POST .../:itemId/complete`; default EN/AR items |
| Consent on tablet | **Foundation** | Upload `CONSENT` via existing operation documents API; checklist includes consent line |
| Operation note template | **Foundation** | `PATCH /operations/:id/operation-note` JSON; pair with clinical templates in UI |
| Supplies used | **Foundation** | `POST /operations/:id/supplies` |
| Installment schedule (down payment / paid amount) | **Foundation** | `POST /operations/:id/installments` rows `{ dueOn, amount }` |

---

## 2. Billing at the front desk

| Requirement | Status | Notes |
|-------------|--------|--------|
| Service & price list (codes, effective dates) | **Foundation** | `ServiceCatalogItem` + `ServicePrice`; `GET/POST /billing/catalog` |
| Contract prices per payer company | **Foundation** | `PayerCompany`, `ContractServicePrice`; resolver in `BillingService.resolvePrice` |
| Invoice lines: qty, price, discount, tax | **Foundation** | `InvoiceLine` columns; manager flag when discount &gt; 15% |
| Split payment cash + card | **Foundation** | `POST /billing/payments` with `allocations[]` |
| Refunds, credit notes, deposits, packages | **Foundation** | `CreditNote`, `PatientServicePackage` tables; APIs next slice |
| Daily cash close per cashier/branch | **Foundation** | `POST /billing/cash-close` compares expected vs counted by method |
| Doctor commission rules & statements | **Foundation** | `CommissionRule` table; statements = reports slice |
| Insurer billing, co-pay, pre-auth | **Foundation** | `PayerPreAuthorization`, copay % on contract prices |
| **Egypt: ETA e-receipts** | **Foundation (priority)** | `EtaReceiptSubmission` auto-queued on payment; `GET /compliance/egypt/eta-queue` — **wire ETA credentials before go-live** |
| **Egypt: data protection consent** | **Foundation (priority)** | `POST /compliance/patients/:id/data-protection-consent` |

---

## 3. Patient messages (clinic-originated)

| Requirement | Status | Notes |
|-------------|--------|--------|
| WhatsApp/SMS templates (EN/AR) | **Foundation** | `GET /messaging/templates` seeds confirm, 24h/2h reminders, results ready |
| Automated reminder queue | **Planned** | `OutboundMessage` QUEUED; connect Twilio/Meta BSP |
| Confirm/cancel replies | **Planned** | Webhook handler + appointment status |
| Recall / campaigns (check-up, lapsed, birthday) | **Foundation** | `GET /messaging/recall-campaigns`; tie to `Patient.acquisitionChannel` in next slice |
| Post-visit satisfaction → doctor score | **Foundation** | `SatisfactionSurveyResponse` table; trigger on encounter finalize (next) |

---

## 4. Reports for the owner

| Requirement | Status | Notes |
|-------------|--------|--------|
| **Today** on dashboard (live) | **Shipped** | `GET /dashboards/today?clinicId=` |
| Period KPIs, P&L, clinic breakdown | **Shipped** | Existing dashboard + reports |
| No-show rate, utilization, revenue/doctor-hour | **Planned** | Extend `reports.service` |
| AR aging, payouts, branch P&L | **Planned** | Use `BillingPayment` + existing revenue/expenses |
| Excel/PDF export & scheduled email | **Planned** | PRD N.1 |

---

## 5. Setup, trust & polish

| Requirement | Status | Notes |
|-------------|--------|--------|
| Onboarding wizard & Excel import | **Planned** | |
| MFA & session expiry | **Planned** | Login MFA field is stub |
| Permissions screen per role | **Shipped** | Admin → org/clinic nav tabs (`org-rbac-panel`, `clinic-nav-tabs-panel`) |
| Thermal/A4 bilingual print | **Partial** | Tax invoices + prescriptions; thermal next |
| Tablet layout / offline schedule | **Planned** | |
| Incident reporting / GAHAR | **Foundation** | `ClinicalIncident` table |

---

## 6. AI inside the clinic module (three features only)

| Feature | Status | API |
|---------|--------|-----|
| **AI scribe** (AR/EN, approve note + Rx) | **Foundation** | `POST /clinic-ai/encounters/:id/scribe/start`, `POST /clinic-ai/scribe/:id/approve` — add speech provider for production |
| **Pre-visit summary** (5 lines) | **Shipped** | `GET /clinic-ai/patients/:id/pre-visit-summary` |
| **No-show risk** on appointments | **Foundation** | `POST /clinic-ai/appointments/refresh-no-show-risk`; `Appointment.noShowRiskScore` — show in UI next |

Distinct from the **role assistant** (`/assistant/chat`): that remains Q&A; clinic-ai is chart workflow.

---

## Related docs

- [FRONT_DESK.md](./FRONT_DESK.md) · [PATIENT_360_AND_SCHEDULING.md](./PATIENT_360_AND_SCHEDULING.md) · [CLINICAL_WORKFLOW.md](./CLINICAL_WORKFLOW.md)
- [Clinic_Management_System_PRD.md](./Clinic_Management_System_PRD.md) · [PRODUCT_EPIC_ROADMAP.md](./PRODUCT_EPIC_ROADMAP.md)

---

## Local verification

```bash
npm run db:ensure
npm run dev
```

1. Create operation → advance status through pre-op → discharged (collect balance on discharge).
2. `POST /api/v1/billing/catalog` then `POST /api/v1/billing/payments` with cash + card allocations → check ETA queue.
3. Record data-protection consent for a patient.
4. `GET /api/v1/dashboards/today`
5. `GET /api/v1/clinic-ai/patients/:id/pre-visit-summary`
