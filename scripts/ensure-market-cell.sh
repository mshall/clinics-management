#!/usr/bin/env bash
# Called on market launch when MARKET_LAUNCH_RUN_DEPLOY=1 (optional automation).
set -euo pipefail
TARGET_REGION="${1:-eu-central-1}"
PRIMARY_REGION="${PLATFORM_PRIMARY_DATA_REGION:-eu-central-1}"
SHARED="${PLATFORM_SHARED_DATA_REGIONS:-eu-central-1}"

IFS=',' read -ra REGIONS <<< "$SHARED"
for r in "${REGIONS[@]}"; do
  r="$(echo "$r" | xargs)"
  if [[ "$r" == "$TARGET_REGION" ]]; then
    echo "Shared cell: market dataRegion=$TARGET_REGION uses existing stack (primary=$PRIMARY_REGION)."
    exit 0
  fi
done

CELL_FROM_REGION="$(node -e "
const fs=require('fs');
const j=JSON.parse(fs.readFileSync('platform/data-cells.json','utf8'));
const hit=Object.entries(j.cells).find(([,c])=>c.awsRegion==='$TARGET_REGION');
process.stdout.write(hit?hit[0]:'');
" 2>/dev/null || true)"
if [[ -n "$CELL_FROM_REGION" ]]; then
  echo "No shared stack for $TARGET_REGION. To provision: KIORLY_HOST_CELL=$CELL_FROM_REGION AWS_REGION=$TARGET_REGION bash scripts/deploy-aws.sh"
else
  echo "No shared stack for $TARGET_REGION. To provision: AWS_REGION=$TARGET_REGION KIORLY_HOST_CELL=<cell-id> bash scripts/deploy-aws.sh"
fi
exit 0