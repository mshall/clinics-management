# Kiorly launch build log

## Autonomous agent rules (resume from here)

**LOOP** (repeat until every step in §5 of `Docs/kiorly-cursor-build-sequence.md` is ticked)

0. **Before starting each step:** `git fetch origin` and merge the latest `origin/main` into `kiorly/launch`; resolve conflicts, run §0.2, push. If the step is already fully implemented on `main`, verify every acceptance criterion with tests, add any missing tests, tick it as **verified on main**, and continue.
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
| 2026-11-18 | Pipeline on `main` @ `4d62eb0` green. `kiorly/launch`, draft PR #75, tracker `kiorly-cursor-build-sequence.md` only. |

## Steps

| Step | Merge on `kiorly/launch` | Notes |
|------|--------------------------|-------|
| 001 FD-00 | `955b94b` | Verified on main |
| 002 FD-01 | `dd42945` | Verified on main |
| 003 FD-02 | `2f98396` | Full ETA/fiscal removal; `postRevenue` only; NH-002 closed; `Docs/FD-02_ETA_RETIRED.md` |
| 017 PL-05 | `12e3ea8` | Usage meters + WhatsApp quota; `Docs/USAGE_METERING.md` |
| 025 PL-09 | `12e3ea8` | `Cohort` model, `GET /public/cohorts/:key/remaining`, signup assign |
| 004 SC-01 | `316c557` | `legalConfig` gates, sub-processor guard, platform legal UI; `Docs/SC-01_FRANKFURT_RESIDENCY.md` |
| 049 PL-07 | `f9dd2d5` | Proration APIs, billing seats, compare-plan preview UI; migration `20261118200000_pl07_subscription_proration` |
| 050 CR-07 | `8ea7373` | `GET /billing/kiorex-progress`, progress ring UI, threshold nudges + audit; migration `20261118210000_cr07_kiorex_progress_nudge` |