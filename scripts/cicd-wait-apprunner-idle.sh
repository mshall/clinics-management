#!/usr/bin/env bash
# CloudFormation rejects ApiService updates when App Runner still has UPDATE_SERVICE in flight
# (OPERATION_IN_PROGRESS). Wait before cdk deploy when rapid main pushes overlap rollouts.
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
MAX_WAIT_SEC="${APPRUNNER_IDLE_WAIT_SEC:-900}"
POLL_SEC="${APPRUNNER_DEPLOY_POLL_SEC:-15}"

SERVICE_ARN="$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?LogicalResourceId=='ApiService'].PhysicalResourceId" \
    --output text 2>/dev/null || true
)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "SKIP  App Runner idle wait (ApiService not in stack yet)"
  exit 0
fi

echo "Waiting for App Runner to be idle before CDK deploy (${SERVICE_ARN})…"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))

while [[ $(date +%s) -lt $deadline ]]; do
  service_status="$(
    aws apprunner describe-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --query "Service.Status" \
      --output text 2>/dev/null || echo UNKNOWN
  )"

  op_status="$(
    aws apprunner list-operations \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --max-results 15 \
      --output json 2>/dev/null \
    | python3 -c "
import json, sys
ops = json.load(sys.stdin).get('OperationSummaryList', [])
for op in ops:
    if op.get('Status') == 'IN_PROGRESS':
        print('IN_PROGRESS')
        sys.exit(0)
print('IDLE')
"
  )"

  if [[ "$service_status" != "OPERATION_IN_PROGRESS" && "$op_status" == "IDLE" ]]; then
    echo "OK  App Runner idle (service status=${service_status})"
    exit 0
  fi

  echo "  App Runner busy (service=${service_status}, operations=${op_status})…"
  sleep "$POLL_SEC"
done

echo "::error::Timed out after ${MAX_WAIT_SEC}s waiting for App Runner to become idle"
exit 1
