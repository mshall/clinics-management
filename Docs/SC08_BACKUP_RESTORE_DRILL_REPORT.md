# Backup restore drill report (SC-08)

Evidence store for quarterly restore drills. **Ops fills a new row after each live Frankfurt drill.** Until the first live drill, status remains `pending` (see NH-018).

## Pilot targets

| Metric | Target |
|--------|--------|
| RPO | ≤ 24 h |
| RTO | ≤ 8 h |
| Region | `eu-central-1` only |

## Drill log

| Quarter | drillStartedAt (UTC) | restorePoint (UTC) | drillFinishedAt (UTC) | RPO | RTO | health/ready | Operator | Result |
|---------|----------------------|--------------------|-----------------------|-----|-----|--------------|----------|--------|
| 2026-Q4 | _pending NH-018_ | — | — | — | — | — | — | pending |

## Notes

- Dry-run (`./scripts/backup-restore-drill.sh --mode dry-run`) proves the runbook artefacts exist; it does not measure RPO/RTO.
- Destroy the temporary restore instance after smoke; never promote it.
