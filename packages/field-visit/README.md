# @kiorly/field-visit

KCV206 (KX-08 §05, ADR-030): the shared field-visit primitives for Kiorly Clinic home visits, Kiorly Nurse and Kiorly Lab home
collection. **Pure library** (no I/O, no timers, no flags, no env) with its own tests and a **safety-drill suite**.
Lives under `packages/` beside the future `@kiorly/commerce-kernel` (KCV202); npm workspaces wire it (`"workspaces": [..., "packages/*"]`).

| Module | What it gives you |
|---|---|
| `zones` | `District`, `CoverageZone`, `isInCoverage` (district list + optional max travel time), `parseDistrictList` (market-pack validation), `buildTravelMatrix` |
| `scheduling` | default 30/30 travel buffers, `blockedInterval`, `canBook` (overlap, daily cap, matrix-aware travel feasibility), `filterBookableSlots`, `orderRoute`, `routeLegs` |
| `lifecycle` | `applyEvent` state machine: REQUESTED → CONFIRMED → ON_MY_WAY → ARRIVED (check-in) → FINISHED; ABORTED_UNSAFE (never a no-show, BR61), CANCELLED, NO_SHOW |
| `geostamp` | `coarsen` (~1 km), 12-month retention then district only |
| `privacy` | `canViewAddress` (assigned clinician + admins, after CONFIRMED, masked 24 h after the visit ends) |
| `safety` | `evaluateSafety` (prompt +30 min, alert +40 min), `answerSafetyPrompt`, `buildSos` (live location + 123/122), `deliverSafetyAlert` over `SafetyAlertDispatcher` channels with the 60 s SLA |
| `ports` | `Clock`, `TravelMatrix`, `SafetyAlertDispatcher` (host implements; real providers sit behind a `MODE=mock|real` adapter) |

## Rules

- **Safety controls are never switchable (ADR-025).** No function takes a flag, an "enabled" option or an environment variable; the drill suite fails if package sources mention them.
- No PHI in alerts: visit id, coarse last position and emergency numbers only.
- Semver. A breaking change is a major with 90-day dual support (ADR-027). The protocol constants (30 / 10 min, 60 s) can only get stricter in a release, never per tenant.
- Each product keeps its own tables for these models; the package never touches a database.

## Commands

```
npm run build -w @kiorly/field-visit        # tsc -> dist (the API consumes dist; api scripts build it first)
npm run test -w @kiorly/field-visit         # unit tests + drills
npm run test:drill -w @kiorly/field-visit   # the safety-drill suite alone (re-run in staging before enabling home visits, KX-17 G5)
```

Publishing to GitHub Packages (`@kiorly` scope) is **NEEDS_HUMAN** (registry access, release owner); `"private": true` until then.
