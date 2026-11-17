# Billing & SaaS money audit (SC-07)

| Task | Status |
|------|--------|
| SC-07 Audit coverage for billing, credits and plan changes | **Done** |

## Scope

Explicit `AuditLog` rows for money-affecting SaaS operations:

- Subscription lifecycle (`subscription.*` via `SubscriptionService.appendEvent`)
- Credit grants/consumes (`credit.grant`, `credit.consume`)
- Kiorly invoice issue/void (`kiorly_invoice.*`)
- Manual payment verify/reject (`kiorly_payment.*`)
- Monthly settlement (`kiorly.settlement.*`)
- Kiorex commission disputes and reversals (`kiorex.commission_charge.*`)
- Kiorex rate CRUD and market commission settings (`kiorex.rate.*`, `kiorex.market_settings.updated`)
- Plan price publish (`plan.price.published`)
- Platform entitlement overrides (`entitlement.override_set`)
- Per-market commercial config (`market.commercial_config_updated`)

Market-wide platform actions anchor `tenantId` on the **oldest tenant in that market** (same pattern as PA-02) because `AuditLog` requires a tenant FK.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v1/admin/platform/audit` | Platform super admin. Query: `entity`, `tenantId`, `page`, `pageSize`, `q`, `from`, `to`. Default date window matches org governance (90-day lookback). |

`entity` values: `subscription`, `credit`, `kiorly_invoice`, `kiorex`, `entitlement`, `plan_price`, `market`, `settlement`, `payment`.

## UI

Platform **Organizations** → open an organization → **Audit** tab: tenant-scoped billing audit list with category filter and search (EN/AR strings under `platform.audit.*`).

Org admins continue to use **Admin → Governance & audit** for the full org trail (`GET /admin/audit-logs`).

## Tests

- `sc07-money-audit-coverage.node.test.ts` — registry enumerates money-affecting service methods and asserts each writes `auditLog.create` with the expected action.
- `sc07-platform-audit.integration.test.ts` — credit grant + entitlement override appear in `PlatformMoneyAuditService.list`.

## Follow-ups

- Export billing audit CSV for compliance demos (PRD 0.8).
- Dispute **reject** platform workflow (approve-only path audited today via `dispute_approved`).
- Wire org billing owners to a filtered governance view using the same entity map (no separate tenant billing tab yet).