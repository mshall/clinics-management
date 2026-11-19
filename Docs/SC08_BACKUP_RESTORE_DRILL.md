# SC-08 · Backup restore drill

| Status | Code/runbook ready — live Frankfurt drill is human/ops (**NH-018**) |
|--------|---------------------------------------------------------------------|

## Shipped

- Runbook: [Docs/runbooks/BACKUP_RESTORE_DRILL.md](./runbooks/BACKUP_RESTORE_DRILL.md)
- Script: `scripts/backup-restore-drill.sh` (`--mode dry-run` for CI; `--mode aws` for ops)
- Report template / evidence store: [Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md](./SC08_BACKUP_RESTORE_DRILL_REPORT.md)
- Infra already: RDS automated backups **35 days**, PITR, Multi-AZ, encrypted, `eu-central-1` (CDK)
- Acceptance tests: `apps/api/src/platform/sc08-backup-restore.node.test.ts`

## Pilot SLO

| Metric | Target |
|--------|--------|
| RPO | ≤ 24 hours |
| RTO | ≤ 8 hours |

## Human / ops

- Run the quarterly restore in Frankfurt and fill the report — **NH-018**.
