# Modular monolith — structure and extraction path

Kiorly ships as a **single deployable API** (`apps/api`) with **bounded contexts** expressed as NestJS modules. The goal is day‑to‑day simplicity with a clear map to future microservices (fiscal gateway, integrations hub, clinical core, etc.) without rewriting the product.

## Layout

| Bounded context | Nest folders (`apps/api/src/`) | Future service (optional) |
|-----------------|--------------------------------|---------------------------|
| **Kernel** | `common`, `prisma`, `auth`, `audit`, `storage`, `health`, `feature-flags` | Shared platform (auth, tenancy) |
| **Organization** | `clinics`, `users`, `admin`, `markets`, `user-nav-tabs`, `user-clinic-privilege-grants`, `user-money-visibility` | Tenant / org service |
| **Clinical** | `patients`, `appointments`, `encounters`, `clinical`, `scheduling`, `operations` | Clinical core |
| **Front office** | `front-desk`, `billing`, `revenue`, `invoices`, `expenses`, `payroll`, `payroll-expenses` | Billing & cashier |
| **Compliance & fiscal** | `compliance`, `fiscal-devices`, `providers`, `integrations` | Fiscal / ETA gateway |
| **Insights** | `reports`, `dashboard` | Analytics read models |
| **Engagement** | `messaging`, `assistant`, `clinic-ai`, `support`, `hr` | Notifications & HR |
| **Composition** | `app.module.ts`, `platform/` | API gateway / BFF |

Definition of contexts and **allowed cross-context import edges** live in:

- `apps/api/src/platform/module-contexts.ts`

## Rules (enforced in CI via unit test)

1. **One Nest module per domain folder** — controllers and services stay inside the folder; `AppModule` only imports `*.module.ts` files.
2. **Cross-context calls** — prefer **injected Nest services** exported from the target module (example: `ClinicsModule` → `FiscalDeviceProvisioningService` from `FiscalDevicesModule`), not dynamic `import()` of another folder.
3. **Public façades** — cross-context file imports should target `*-public.ts` barrels where present:
   - `fiscal-devices/fiscal-devices-public.ts`
   - `compliance/compliance-public.ts`
4. **Kernel `common/`** — shared DTOs and helpers; may reference organization/clinical types today. New code should avoid deepening these couplings; prefer context-local DTOs or `platform/contracts` when adding features.
5. **Data** — single PostgreSQL schema with `tenantId`; extraction later uses **per-service schema** or event-outbox patterns (RFC backlog).

Automated check: `apps/api/src/platform/module-boundaries.node.test.ts` (included in `npm run test:unit -w api`).

**Before pushing API changes:** `npm run ci:test` (or rely on the **pre-push** hook after `npm run hooks:install`). When you add a new top-level folder under `apps/api/src/`, register it in `platform/module-contexts.ts`. Shared logic used from multiple contexts belongs in `common/` (kernel), not direct cross-context imports.

## Extracting a context to a microservice

1. **Stop inbound relative imports** — other contexts use HTTP/events; shrink `ALLOWED_CROSS_CONTEXT_IMPORTS` for that context.
2. **Export OpenAPI** for the module’s routes (`npm run openapi:export -w api`).
3. **Move Prisma models** to a dedicated schema or DB; replace in-process calls with a client generated from OpenAPI.
4. **Deploy** behind the same CloudFront `/api/*` prefix with path-based routing (see `Docs/Clinic_Management_System_RFC.md` §14).

PiggyMetrics-style decomposition reference: `apps/docs/content/architecture-comparison.md`.

## Related docs

- [Clinic_Management_System_RFC.md](./Clinic_Management_System_RFC.md) — §4 modular monolith decision
- [MULTI_MARKET.md](./MULTI_MARKET.md) — provider adapters inside `compliance-fiscal`
- [CLINIC_PLATFORM_CAPABILITIES.md](./CLINIC_PLATFORM_CAPABILITIES.md) — feature ↔ module map