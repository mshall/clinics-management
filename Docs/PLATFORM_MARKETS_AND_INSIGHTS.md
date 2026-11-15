# Platform markets, operations, and insights

## Country markets

| Concept | Meaning |
|---------|---------|
| **DRAFT** | Pack configured; not yet available for org onboarding |
| **LIVE** | Launched; orgs may bind when **operationally active** |
| **operability** | `active` · `paused` (auto-resume at `pausedUntil`) · `disabled` (until re-enabled) |

**UI:** Platform → **Market launch** — create draft (country, AWS region, currency), **Go live**, pause/disable/enable, feature flags, delete draft only.

**Go live & AWS:** `POST …/markets/:id/launch` sets status `LIVE` and records a provision note. If `dataRegion` is in `PLATFORM_SHARED_DATA_REGIONS` (default `eu-central-1`), the market shares the existing Frankfurt stack. Otherwise ops runs `scripts/ensure-market-cell.sh` / `deploy-aws.sh` with `deployRegion`. Optional: `MARKET_LAUNCH_RUN_DEPLOY=1` and `KIORLY_REPO_ROOT` to invoke the shell hook from the API.

## Create organization

- **Country** = required choice from `GET /admin/platform/markets/operable` (LIVE + active).
- Optional **tax registration** and **facility license** seed tenant defaults for compliance.
- Demo **Dr Ahmed El Shall** group is bound to **EG** market after migrate/seed.

## Platform insights

**Platform → Insights**

| Tab | API |
|-----|-----|
| Organizations 360° | `GET /admin/platform/insights/organizations` |
| Platform performance | `GET /admin/platform/insights/platform` |

## MFA setup (profile)

TOTP setup shows a **QR code** and optional **copy secret** — not the raw `otpauth://` URL.

## Related

- [MARKET_GO_LIVE_TEMPLATE.md](./MARKET_GO_LIVE_TEMPLATE.md) · [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) · [AWS_Cloud_Deployment_Guide.md](./AWS_Cloud_Deployment_Guide.md)