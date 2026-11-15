#!/usr/bin/env bash
# Block CDK ApiService update while App Runner still has UPDATE_SERVICE in progress (OPERATION_IN_PROGRESS).
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
MAX_WAIT_SEC="${APPRUNNER_IDLE_WAIT_SEC:-900}"
POLL_SEC="${APPRUNNER_IDLE_POLL_SEC:-20}"

SERVICE_ARN="$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?LogicalResourceId=='ApiService'].PhysicalResourceId" \
    --output text 2>/dev/null || true
)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "WARN  ApiService ARN not found — skipping App Runner idle wait"
  exit 0
fi

echo "Waiting for App Runner service idle before CDK deploy on ${SERVICE_ARN} (max ${MAX_WAIT_SEC}s)…"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))

while [[ $(date +%s) -lt $deadline ]]; do
  busy="$(
    aws apprunner list-operations \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --max-results 5 \
      --output json \
    | python3 -c "
import json, sys
ops = json.load(sys.stdin).get('OperationSummaryList', [])
for op in ops:
    if op.get('Status') == 'IN_PROGRESS':
        print(op.get('Type', 'UNKNOWN'))
        break
"
  )"
  if [[ -z "$busy" ]]; then
    status="$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" \
      --query 'Service.Status' --output text 2>/dev/null || echo UNKNOWN)"
    if [[ "$status" != "OPERATION_IN_PROGRESS" ]]; then
      echo "OK  App Runner idle (service status=${status})"
      exit 0
    fi
    busy="OPERATION_IN_PROGRESS"
  fi
  echo "  App Runner busy (${busy}) — waiting ${POLL_SEC}s…"
  sleep "$POLL_SEC"
done

echo "::error::Timed out waiting for App Runner to finish in-flight operations (avoid OPERATION_IN_PROGRESS on ApiService)"
exit 1