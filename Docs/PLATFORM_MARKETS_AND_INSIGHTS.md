# Platform markets, operations, and insights

## Country markets

| Concept | Meaning |
|---------|---------|
| **DRAFT** | Pack configured; not yet available for org onboarding |
| **LIVE** | Launched; orgs may bind when **operationally active** |
| **operability** | `active` · `paused` (auto-resume at `pausedUntil`) · `disabled` (until re-enabled) |

**UI:** Platform → **Market launch** — create draft (country, AWS region, currency), **Go live**, pause/disable/enable, feature flags, delete draft only.

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