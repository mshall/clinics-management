#!/usr/bin/env bash
# Block CDK deploy until App Runner is not OPERATION_IN_PROGRESS (avoids CFN InvalidRequest).
# Overlapping main-branch deploys or a slow image rollout can leave an UPDATE_SERVICE running while
# the next workflow starts cdk deploy after docker build (~5–10 min).
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
MAX_WAIT_SEC="${APPRUNNER_IDLE_WAIT_SEC:-900}"
POLL_SEC="${APPRUNNER_IDLE_POLL_SEC:-15}"

SERVICE_ARN="$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?LogicalResourceId=='ApiService'].PhysicalResourceId" \
    --output text 2>/dev/null || true
)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "WARN  ApiService ARN not found — skipping App Runner idle wait (first deploy?)"
  exit 0
fi

echo "Waiting for App Runner idle (Status=RUNNING, no IN_PROGRESS operations) on ${SERVICE_ARN} (max ${MAX_WAIT_SEC}s)…"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))

while [[ $(date +%s) -lt $deadline ]]; do
  service_status="$(
    aws apprunner describe-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --query 'Service.Status' \
      --output text 2>/dev/null || echo "UNKNOWN"
  )"

  in_progress_count="$(
    aws apprunner list-operations \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --max-results 10 \
      --output json \
    | python3 -c "
import json, sys
ops = json.load(sys.stdin).get('OperationSummaryList', [])
print(sum(1 for op in ops if op.get('Status') == 'IN_PROGRESS'))
"
  )"

  if [[ "$service_status" == "RUNNING" && "${in_progress_count:-0}" -eq 0 ]]; then
    echo "OK  App Runner idle (Status=RUNNING)"
    exit 0
  fi

  echo "  App Runner not idle: Status=${service_status} in_progress_ops=${in_progress_count} — waiting…"
  sleep "$POLL_SEC"
done

echo "::error::Timed out after ${MAX_WAIT_SEC}s waiting for App Runner to become idle (last Status=${service_status})"
aws apprunner list-operations \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --max-results 5 \
  --output json || true
exit 1
