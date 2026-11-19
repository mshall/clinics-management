# Runbook · Quarterly RDS backup restore drill (SC-08)

| | |
|---|---|
| **Region** | `eu-central-1` (Frankfurt) only |
| **Cadence** | Quarterly (calendar) |
| **Targets (pilot)** | RPO ≤ 24 h · RTO ≤ 8 h |
| **Owner** | Platform ops |
| **Script** | `scripts/backup-restore-drill.sh` |

## Preconditions

1. AWS credentials that can describe RDS snapshots and create a temporary restore instance in **eu-central-1**.
2. Staging VPC / security groups already used by the non-prod cell (never restore into production subnets).
3. Confirm CDK `backupRetention` is **35 days** and Multi-AZ + storage encryption are on (`infra/src/kiorly-clinics-management-stack.ts`).

## Procedure

1. **Record start** — note UTC wall clock as `drillStartedAt`.
2. **Identify backup** — latest automated snapshot or choose a PITR timestamp ≤ 24 h behind production write activity. Record `backupTakenAt` / `restorePointInTime` (this is the RPO evidence).
3. **Restore** — run:
   ```bash
   ./scripts/backup-restore-drill.sh --mode aws --region eu-central-1 \
     --source-instance <prod-or-staging-db-id> \
     --restore-instance-id kiorly-drill-$(date -u +%Y%m%d) \
     --report Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md
   ```
   The script creates a temporary instance from the snapshot/PITR, waits until available, then prints connection endpoints.
4. **Migrate + smoke** — against the restore endpoint:
   ```bash
   DATABASE_URL=... npx prisma migrate deploy -w api
   curl -fsS "$RESTORE_API/api/v1/health/ready"   # expect {"database":"ok",...}
   ```
5. **Record finish** — `drillFinishedAt`. Compute:
   - **RPO** = production_latest_write − restore_point (must be ≤ 24 h)
   - **RTO** = drillFinishedAt − drillStartedAt (must be ≤ 8 h)
6. **Tear down** — delete the restore instance (and any temporary security-group rules). Do **not** promote the drill DB.
7. **File the report** — fill `Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md` (template below is kept in-repo; each drill overwrites the dated section or appends a quarterly row).

## Local dry-run (CI / agent)

```bash
./scripts/backup-restore-drill.sh --mode dry-run
```

Validates script + template exist; does **not** touch AWS or local Postgres data.

## Hard rules

- Never wipe or restore over the developer’s local `.pgdata` / Docker Postgres used for `npm run dev`.
- Never change Path A / Frankfurt residency controls as part of a drill.
- Personal data from a production snapshot stays in `eu-central-1` and is destroyed with the drill instance.
