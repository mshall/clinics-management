# Kiorly launch build log

## Autonomous agent rules (resume from here)

**LOOP** (repeat until every step in §5 of `KIORLY_BUILD_SEQUENCE.md` is ticked)

1. In §5, find the first unchecked step. Read only its section in §6. Read §2–§4 only when the step refers to them.
2. Create branch `kiorly/<STEP-ID>-<slug>` from the latest `kiorly/launch`.
3. Implement following §0.1 (schema → API → web en+ar → tests → docs). Run every command in §0.2; up to 3 fix rounds.
4. Merge step branch into `kiorly/launch` (merge commit `[<STEP-ID>] <title>`), run §0.2 on launch, push, delete step branch.
5. Tick §5 with merge hash; append one line below; at end of each stage, stage summary + tag `kiorly-stage-<letter>`.

**NEVER** until FINAL PHASE: commit/merge/push `main`, merge draft PR, run deploy scripts, edit workflows/infra unless step requires, skip/reorder steps, break §0.5 hard rules.

**FINAL PHASE** only when all §5 ticked: green PR checks → `gh pr merge` → watch `deploy-aws.yml` → tag `kiorly-launch-v1`.

---

## Setup

| When (UTC) | Event |
|------------|--------|
| 2026-11-18 | Pipeline on `main` @ `4d62eb0` green (CI test, web-build, deploy). Created `kiorly/launch`, draft PR, this log + `KIORLY_NEEDS_HUMAN.md`. |

## Steps

| Step | Merge on `kiorly/launch` | Notes |
|------|--------------------------|-------|
| 001 FD-00 | `955b94b` | Pre-shipped on main; verified tests + `Docs/FD-00_MARKET_TAX_DEFAULTS.md` |
| 002 FD-01 | (pending merge) | Pre-shipped; `effective-roles.ts`, transfer-ownership, E2E `owner-physician-flow` |