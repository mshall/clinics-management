#!/usr/bin/env bash
# CloudFormation can report ApiService UPDATE_COMPLETE while App Runner is still rolling
# out the new image — list-operations may show ROLLBACK_SUCCEEDED ~40s later when health
# checks fail (HEAD /health/live → 503, nothing on :3000 during secret fetch, etc.).
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
MAX_WAIT_SEC="${APPRUNNER_DEPLOY_WAIT_SEC:-600}"
POLL_SEC="${APPRUNNER_DEPLOY_POLL_SEC:-15}"

SERVICE_ARN="$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?LogicalResourceId=='ApiService'].PhysicalResourceId" \
    --output text 2>/dev/null || true
)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "WARN  ApiService ARN not found — skipping App Runner operation wait"
  exit 0
fi

echo "Waiting for latest App Runner UPDATE_SERVICE on ${SERVICE_ARN} (max ${MAX_WAIT_SEC}s)…"
deadline=$(( $(date +%s) + MAX_WAIT_SEC ))

while [[ $(date +%s) -lt $deadline ]]; do
  status="$(
    aws apprunner list-operations \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --max-results 10 \
      --output json \
    | python3 -c "
import json, sys
ops = json.load(sys.stdin).get('OperationSummaryList', [])
for op in ops:
    if op.get('Type') == 'UPDATE_SERVICE':
        print(op.get('Status', ''))
        break
"
  )"

  case "$status" in
    SUCCEEDED)
      echo "OK  App Runner UPDATE_SERVICE SUCCEEDED"
      exit 0
      ;;
    ROLLBACK_SUCCEEDED | ROLLBACK_FAILED | FAILED)
      echo "::error::App Runner UPDATE_SERVICE ${status} — new revision did not pass health checks (search CloudWatch /aws/apprunner for [boot])"
      aws apprunner list-operations \
        --service-arn "$SERVICE_ARN" \
        --region "$REGION" \
        --max-results 5 \
        --output json
      exit 1
      ;;
    IN_PROGRESS | "" )
      echo "  App Runner UPDATE_SERVICE still in progress (${status:-pending})…"
      sleep "$POLL_SEC"
      ;;
    *)
      echo "  App Runner UPDATE_SERVICE status: ${status} — waiting…"
      sleep "$POLL_SEC"
      ;;
  esac
done

echo "::error::Timed out after ${MAX_WAIT_SEC}s waiting for App Runner UPDATE_SERVICE to succeed"
exit 1
