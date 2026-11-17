# Multi-role users (FD-01)

| Status | Done (per-tab read/write grants; API + web on org modules: patients, encounters, appointments, operations, expenses, revenue, HR, reports, support, clinics) |
|--------|------|

## Model

- `User.role` — primary role (unchanged for legacy callers).
- `User.additionalRoles` — extra `UserRole[]` (default `[]`).
- `User.isTenantOwner` — exactly one `true` per tenant (ownership transfer, billing).

## API helpers

`apps/api/src/common/effective-roles.ts`: `effectiveRoles`, `hasRole`, `hasAnyRole`, `hasAnyRoleInSet`, `isTenantOwnerPrincipal`.

JWT/session payload includes `roles[]`, `additionalRoles`, `isTenantOwner`. Nav tabs = union of role presets (`TenantRoleNavTabsService.effectiveRoleNavTabKeysForPrincipal`).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/api/v1/admin/users/:id/roles` | `{ additionalRoles }` |
| `POST` | `/api/v1/admin/tenant/transfer-ownership` | `{ toUserId, mfaCode? }` |

## Tests

- `rbac-role-check.node.test.ts` — grep guard + owner-physician unit cases.
- `apps/web/e2e/owner-physician-flow.spec.ts` — E2E golden flow.

## Follow-ups

- Plan-based seat limits for additional roles (currently capped at 3 in API).
- Per-role nav tab grants when user holds multiple roles (today: union of tenant role presets).