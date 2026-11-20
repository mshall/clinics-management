# Plans & entitlements matrix (PL-04)

Commercial gating source of truth: module entitlements, plan seed, API `@RequiresEntitlement`, feature-flag bridge, and nav presets (PL-06).

**Code source:** `apps/api/src/entitlements/plans-matrix.ts`  
**Seed:** `apps/api/prisma/plans.seed.ts` (invoked from `plan-catalog-seed.ts`)

## 01. Controller map

| Module area | Controller | Policy | Entitlement |
|-------------|------------|--------|-------------|
| Core clinical | `patients`, `appointments`, `scheduling`, `encounters` | open | — |
| Organization | `clinics`, `users`, `admin`, `billing`, `dashboard`, `support` | open | — |
| Clinical+ | `clinical` | gated | `mod_clinical` |
| Front desk | `front-desk` | gated | `mod_front_desk` |
| Surgery / OR | `operations` | gated | `mod_operations` |
| Finance | `revenue`, `expenses`, `invoices` | gated | `mod_*` |
| People | `hr` | gated | `mod_hr` |
| Analytics | `reports` | gated | `mod_reports` |
| Engagement | `messaging` | gated | `mod_messaging` |
| AI | `assistant`, `clinic-ai` | gated / mixed | `ai_assistant`, `ai_scribe` (add-on) |
| Fiscal | `compliance` (submit/resubmit), `fiscal-devices`, `provider-credentials` | mixed / gated | `eta_receipts` |
| Integrations | `integration-*`, `integrations/*` | gated | `mod_integrations` |
| Admin tools | `admin/data-explorer` | gated | `mod_data_explorer` |
| Platform / webhooks | `admin/platform`, `plans/platform`, `markets`, ETA notifications | platform / webhook | — |

## 02. Plan entitlement matrix

Boolean module keys by plan (`Yes` = entitled). Limits use numeric cells.

<!-- MATRIX:START -->
| Entitlement | Lite | Pro | Clinic | Enterprise |
|-------------|------|-----|--------|------------|
| `max_clinicians` | 2 | 10 | 50 | Unlimited |
| `max_branches` | 1 | 5 | 25 | Unlimited |
| `max_assistant_seats` | 2 | 10 | 30 | Unlimited |
| `mod_clinical` | No | Yes | Yes | Yes |
| `mod_front_desk` | No | Yes | Yes | Yes |
| `mod_operations` | No | No | Yes | Yes |
| `mod_invoices` | No | Yes | Yes | Yes |
| `mod_revenue` | Yes | Yes | Yes | Yes |
| `mod_expenses` | No | Yes | Yes | Yes |
| `mod_hr` | No | Yes | Yes | Yes |
| `mod_payroll` | No | No | Yes | Yes |
| `mod_reports` | No | Yes | Yes | Yes |
| `mod_messaging` | No | Yes | Yes | Yes |
| `mod_integrations` | No | No | Yes | Yes |
| `mod_data_explorer` | No | No | Yes | Yes |
| `eta_receipts` | No | Yes | Yes | Yes |
| `ai_assistant` | No | Yes | Yes | Yes |
| `ai_scribe` | No | No | Yes | Yes |
| `deposits` | No | Yes | Yes | Yes |
| `multi_branch` | No | No | Yes | Yes |
| `whatsapp_reminders` | No | Yes | Yes | Yes |
| `card_payments` | No | Yes | Yes | Yes |
| `instapay` | No | Yes | Yes | Yes |
| `fawry` | No | Yes | Yes | Yes |
| `dedicated_support` | No | No | No | Yes |
| `pack_dental` | No | No | No | No |
| `pack_aesthetics` | No | No | No | No |
| `pack_physio` | No | No | No | Yes |
| `home_route_view` | No | Yes | Yes | Yes |
| `home_dispatch` | No | No | Yes | Yes |
| `nurse_family_updates` | No | No | No | Yes |
| `nurse_private_duty_shifts` | No | No | No | Yes |
| `nurse_lab_samples` | No | No | No | Yes |
| `nurse_agency` | No | No | No | Yes |
<!-- MATRIX:END -->

## 03. Feature flags → entitlements

| Feature flag | Entitlement key |
|--------------|-----------------|
| `eta_receipts` | `eta_receipts` |
| `ai_assistant` | `ai_assistant` |
| `whatsapp_reminders` | `whatsapp_reminders` |
| `card_payments` | `card_payments` |
| `instapay` | `instapay` |
| `fawry` | `fawry` |

Resolved in `FeatureFlagsService` after global → market → **plan** → org layers.

## 04. Nav tab presets (PL-06)

Sidebar tabs are **role/user grants ∩ plan preset ∩ entitlement flags**, applied on `GET /auth/me` and mirrored in `apps/web/src/lib/nav-policy.ts`.

| Nav tab | Entitlement (when listed) |
|---------|-------------|
| `operations` | `mod_operations` |
| `expenses` | `mod_expenses` |
| `revenue` | `mod_revenue` |
| `hr` | `mod_hr` |
| `reports` | `mod_reports` |
| `doctor_revenue` | `mod_revenue` |

**Lite (≤8 tabs):** Today (`dashboard`), Appointments, Patients, Visits & Rx (`encounters`), Billing (`revenue`), Settings (`admin`), Help (`customer_support`), Profile.  
**Pro** adds: Reports, Clinics (catalog), Expenses. **Clinic** adds: Operations, HR. **Enterprise:** full org nav including `doctor_revenue`.

Lite **Settings** (`/admin`) is a simplified page (profile, hours, appointment types, WhatsApp/ETA add-ons). Multi-branch clinic pickers hide when `multi_branch` is false (`max_branches: 1`).

Blocked deep links render the upgrade card (`NavGate` + `UpgradeHint`), not a crash.

## Status

| Task | Status |
|------|--------|
| PL-04 Module entitlement map | Shipped |
| PL-03 Entitlement resolve + 402 | Shipped |
| PL-06 Lite simplified nav & settings | **Done** |