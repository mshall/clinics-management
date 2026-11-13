#!/usr/bin/env bash
# Block cdk deploy until App Runner has no UPDATE_SERVICE (or PAUSE/RESUME) in progress.
# Avoids CloudFormation ApiService UPDATE_FAILED: OPERATION_IN_PROGRESS when main gets rapid pushes.
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
  echo "WARN  ApiService ARN not found - skipping App Runner idle wait (first deploy?)"
  exit 0
fi

echo "Waiting for App Runner service to be idle before CDK deploy (max ${MAX_WAIT_SEC}s)…"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))

while [[ $(date +%s) -lt $deadline ]]; do
  block="$(
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
        print(f\"{op.get('Type', 'UNKNOWN')}:{op.get('Id', '')}\")
        break
"
  )"

  if [[ -z "$block" ]]; then
    echo "OK  App Runner idle - proceeding with CDK deploy"
    exit 0
  fi

  echo "  App Runner operation in progress (${block})…"
  sleep "$POLL_SEC"
done

echo "::error::Timed out after ${MAX_WAIT_SEC}s waiting for App Runner to become idle"
exit 1
