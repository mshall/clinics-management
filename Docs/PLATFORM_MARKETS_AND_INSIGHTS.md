# Platform markets, operations, and insights

## Country markets

| Concept | Meaning |
|---------|---------|
| **DRAFT** | Pack configured; not yet available for org onboarding |
| **LIVE** | Launched; orgs may bind when **operationally active** |
| **operability** | `active` · `paused` (auto-resume at `pausedUntil`) · `disabled` (until re-enabled) |

**UI:** Platform → **Market launch** — **Initiate country launch** (pick the country: currency, timezone, locale, phone region, weekend days and languages are filled and validated; AWS region and host cell), **Prerequisites** (tax pack, cross-border approval, optional second approver), **Go live**, Pause (1 to 365 days), Disable, Enable (each asks for a **reason**, an approval reference and an https approval link and shows a clear error in EN/AR), **History** (append-only audit: actor, time, reason, approval, second approver), feature flags, delete draft only.

**Audit and approval (founder decision C, 27 Nov 2026).** Every lifecycle decision writes an append-only `MarketAuditEvent` in the same transaction (a trigger forbids UPDATE and DELETE). A double click or two administrators change the state once and write one row; Enable and Disable are idempotent. `Market.requireSecondApprover` (default off): the change becomes a `MarketChangeRequest` that a different person approves.

**An organisation belongs to its country for life (decision A).** `Tenant.marketId` never changes (API refuses, database trigger); a clinic's country is the organisation's and read-only in the UI; a Kiorex booking naming another market is refused (`409 CROSS_MARKET_BOOKING`). A correction is the documented data fix in ADR-060.

**Kiorly admin.** The same market data is reachable from the Kiorly admin edition of the Ops console over the signed `/marketplace/v1/markets` routes (scope `MARKET_ADMIN`, see ADR-060 and the platform's `Docs/KIORLY_ADMIN.md`); the Market table and the audit trail stay here.

**Kiorly admin, plans (28 Nov 2026).** The same signed door, scope and actor rule serve the plan catalogue: `GET /marketplace/v1/plans` (every plan incl. non-public, all price versions, plus the markets), `PATCH /marketplace/v1/plans/:planId` (names, public flag, order) and `POST /marketplace/v1/plans/:planId/prices` (a new effective-dated price version, or `preview: true` for the SB-06 impact). Plans, entitlements and prices stay owned here; entitlements and plan creation are not exposed. A price published this way writes the usual `plan.price.published` audit row with `actorId` null (no Clinic user; the column is a foreign key) and the console user in `metadata.actorRef` with `actorSource KIORLY_ADMIN`. Amounts are checked (digits with at most two decimals) on both routes. The public catalogue `GET /api/v1/public/plans?market=` is unchanged and is what the Kiorly landing page reads through the Kiorex platform. **Maker-checker (28 Nov 2026):** a price PUBLISH (not a preview) through this route must carry `approval: { proposalId, proposedBy }` (the proposal lives in the Kiorex platform, Kiorly admin: ops proposes, a different super admin approves) and `proposedBy` may not be the acting console user (403 `TWO_PERSON_RULE`; 400 `APPROVAL_REQUIRED` without it); both ids land on the `plan.price.published` audit row (`approvalProposalId`, `proposedBy`). The Clinic web console (Clinic platform super admin) keeps its own direct price form: closing it is an open founder decision.

**Go live & AWS:** `POST …/markets/:id/launch` sets status `LIVE` and records a provision note. If `dataRegion` is in `PLATFORM_SHARED_DATA_REGIONS` (default `eu-central-1`), the market shares the existing Frankfurt stack. Otherwise ops runs `scripts/ensure-market-cell.sh` / `KIORLY_HOST_CELL=… bash scripts/deploy-aws.sh`. Optional: `MARKET_LAUNCH_RUN_DEPLOY=1` and `KIORLY_REPO_ROOT` to invoke the shell hook from the API.

**SC-01 data residency:** Egypt production uses cell **`frankfurt`** (`eu-central-1`) per [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md). Registry: `platform/data-cells.json`. EG market/tenant bindings are enforced in API validation and CI infra tests.

## Create organization

- **Country** = required choice from `GET /admin/platform/markets/operable` (LIVE + active).
- Optional **tax registration** and **facility license** seed tenant defaults for compliance.
- Demo **Dr Ahmed El Shall** group is bound to **EG** market after migrate/seed.

## Support access with consent (PA-04)

Platform support cannot open a patient chart without an **owner-approved**, time-boxed `SupportAccessSession`. PHI is masked by default (phone/national ID truncated; DOB/email hidden). Every chart read writes `SupportAccessReadLog` + `AuditLog` (`support.patient_chart_read`).

| API | Who |
|-----|-----|
| `POST /support/access-requests` | Platform super admin |
| `GET /support/access-requests` | Tenant owner / group admin (approval queue) |
| `POST /support/access-requests/:id/decide` | Owner approve/deny (+ optional unmask) |
| `GET /support/access-sessions/patients/:patientId?tenantId=` | Platform agent with active session |

**UI:** Customer support → **Kiorly access** (owner prompt); Platform tenant console → **Support access** (request).

## Tenant lifecycle console (PA-01)

**UI:** Platform → Organizations → **Open lifecycle console** (`/platform/organizations/:tenantId`).

Tabbed view of subscription, trial (extend), wallet (grant credits), SaaS invoices, entitlement overrides, Kiorex listings, clinician verification, activation score, and recent audited events.

**API:** `GET /admin/platform/tenants/:tenantId` returns the lifecycle payload. Mutations: `POST …/extend-trial`, `POST …/credits`, `PUT …/entitlement-overrides/:key`. All require platform super admin and write `AuditLog` rows.

## Platform insights

**Platform → Insights**

| Tab | API |
|-----|-----|
| Organizations 360° | `GET /admin/platform/insights/organizations` |
| Platform performance | `GET /admin/platform/insights/platform` |
| Growth (PA-05) | `GET /admin/platform/growth` — funnel, cohorts, MRR/ARR, Kiorex attach, by rep; counts match Tenant / OnboardingProgress / Subscription / MarketplaceListing / AuditLog |

## MFA setup (profile)

TOTP setup shows a **QR code** and optional **copy secret** — not the raw `otpauth://` URL.

## Related

- [MARKET_GO_LIVE_TEMPLATE.md](./MARKET_GO_LIVE_TEMPLATE.md) · [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) · [AWS_Cloud_Deployment_Guide.md](./AWS_Cloud_Deployment_Guide.md)