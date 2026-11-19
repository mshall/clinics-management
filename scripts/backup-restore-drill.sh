#!/usr/bin/env bash
# SC-08 — quarterly RDS backup restore drill helper.
# dry-run: validate artefacts (safe for CI / local agents; never touches DB).
# aws: restore a temporary instance in eu-central-1 from the latest snapshot (ops).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="dry-run"
REGION="eu-central-1"
SOURCE_INSTANCE=""
RESTORE_INSTANCE_ID=""
REPORT="$ROOT/Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md"

usage() {
  cat <<'EOF'
Usage: scripts/backup-restore-drill.sh [--mode dry-run|aws] [aws options]

  --mode dry-run   Validate runbook + report template (default). No AWS, no DB writes.
  --mode aws       Restore latest automated snapshot to a temporary RDS instance.
  --region         Default eu-central-1 (Frankfurt only).
  --source-instance  Source DB instance identifier (required for aws).
  --restore-instance-id  Temporary restore id (required for aws).
  --report         Path to drill report markdown (default Docs/SC08_BACKUP_RESTORE_DRILL_REPORT.md).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --region) REGION="${2:-}"; shift 2 ;;
    --source-instance) SOURCE_INSTANCE="${2:-}"; shift 2 ;;
    --restore-instance-id) RESTORE_INSTANCE_ID="${2:-}"; shift 2 ;;
    --report) REPORT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "$REGION" != "eu-central-1" ]]; then
  echo "FAIL: restore drills must run in eu-central-1 (got $REGION)" >&2
  exit 1
fi

dry_run() {
  local runbook="$ROOT/Docs/runbooks/BACKUP_RESTORE_DRILL.md"
  local doc="$ROOT/Docs/SC08_BACKUP_RESTORE_DRILL.md"
  local missing=0
  for f in "$runbook" "$doc" "$REPORT" "$ROOT/scripts/backup-restore-drill.sh"; do
    if [[ ! -f "$f" ]]; then
      echo "MISSING: $f" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
  if ! grep -q "RPO" "$REPORT" || ! grep -q "RTO" "$REPORT"; then
    echo "FAIL: report template missing RPO/RTO columns" >&2
    exit 1
  fi
  if ! grep -q "eu-central-1" "$runbook"; then
    echo "FAIL: runbook must pin eu-central-1" >&2
    exit 1
  fi
  echo "PASS: SC-08 dry-run — runbook, report template, and script present (region=$REGION)"
}

aws_restore() {
  if [[ -z "$SOURCE_INSTANCE" || -z "$RESTORE_INSTANCE_ID" ]]; then
    echo "FAIL: --source-instance and --restore-instance-id required for --mode aws" >&2
    exit 2
  fi
  if ! command -v aws >/dev/null 2>&1; then
    echo "FAIL: aws CLI not installed" >&2
    exit 1
  fi

  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "drillStartedAt=$started region=$REGION source=$SOURCE_INSTANCE restore=$RESTORE_INSTANCE_ID"

  local snapshot
  snapshot="$(
    aws rds describe-db-snapshots \
      --region "$REGION" \
      --db-instance-identifier "$SOURCE_INSTANCE" \
      --snapshot-type automated \
      --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[0].DBSnapshotIdentifier' \
      --output text
  )"
  if [[ -z "$snapshot" || "$snapshot" == "None" ]]; then
    echo "FAIL: no automated snapshot found for $SOURCE_INSTANCE in $REGION" >&2
    exit 1
  fi
  echo "Using snapshot: $snapshot"

  aws rds restore-db-instance-from-db-snapshot \
    --region "$REGION" \
    --db-instance-identifier "$RESTORE_INSTANCE_ID" \
    --db-snapshot-identifier "$snapshot" \
    --publicly-accessible false \
    >/dev/null

  echo "Waiting for $RESTORE_INSTANCE_ID to become available..."
  aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "$RESTORE_INSTANCE_ID"

  local endpoint
  endpoint="$(
    aws rds describe-db-instances \
      --region "$REGION" \
      --db-instance-identifier "$RESTORE_INSTANCE_ID" \
      --query 'DBInstances[0].Endpoint.Address' \
      --output text
  )"
  local finished
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat <<EOF
RESTORE_READY
drillStartedAt=$started
drillFinishedAt=$finished
snapshot=$snapshot
endpoint=$endpoint
next=Set DATABASE_URL to the restore instance, run prisma migrate deploy, curl health/ready, then fill $REPORT and delete $RESTORE_INSTANCE_ID
EOF
}

case "$MODE" in
  dry-run) dry_run ;;
  aws) aws_restore ;;
  *) echo "FAIL: unknown mode $MODE" >&2; usage; exit 2 ;;
esac
