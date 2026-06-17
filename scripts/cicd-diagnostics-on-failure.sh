#!/usr/bin/env bash
# Run from GitHub Actions after a failed CDK deploy. Collects CFN + App Runner API + CloudWatch (no secrets).
# Tunable: LOG_LOOKBACK_MS, LOG_GROUPS_MAX, LINES_PER_GROUP, STACK_EVENTS_RECENT, LOG_SINCE (for `aws logs tail`, e.g. 3h).
#
# `aws logs tail` defaults to --follow (live stream), which never returns and blocks "Cancel workflow".
# We pass --no-follow everywhere. SIGTERM/SIGINT kills child CLIs so the job stops promptly.
set +e
export AWS_PAGER=""
trap 'export _diag_cancel=1; echo "::notice::Diagnostics interrupted — stopping child processes..."; pkill -TERM -P "$$" 2>/dev/null || true; sleep 0.3; pkill -KILL -P "$$" 2>/dev/null || true; exit 143' TERM INT
STACK="${CDK_STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
LOOKBACK_MS="${LOG_LOOKBACK_MS:-7200000}" # 2 hours (filter-log-events fallback)
START_MS=$(( $(date +%s) * 1000 - LOOKBACK_MS ))
GROUPS_MAX="${LOG_GROUPS_MAX:-35}"
LINES_PER_GROUP="${LINES_PER_GROUP:-250}"
STACK_EVENTS_RECENT="${STACK_EVENTS_RECENT:-60}"
LOG_SINCE="${LOG_SINCE:-2h}"

STACK_STATUS="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo UNKNOWN)"

echo "::group::CloudFormation stack (current status)"
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].{Name:StackName,Status:StackStatus,Reason:StackStatusReason}' --output table 2>&1
if [[ "$STACK_STATUS" == UPDATE_COMPLETE || "$STACK_STATUS" == CREATE_COMPLETE ]]; then
  echo ""
  echo "NOTE: Stack is ${STACK_STATUS}. If deploy-full.log is missing, the job likely failed in"
  echo "  'Pre-deploy database backup' (before CDK deploy), not in CloudFormation."
  echo "  FAILED/ROLLBACK events below may be from earlier deploy attempts (e.g. fixed ASCII SG description)."
fi
echo "::endgroup::"

echo "::group::Stack events (FAILED / ROLLBACK — may include older attempts)"
aws cloudformation describe-stack-events --stack-name "$STACK" --region "$REGION" \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED') || contains(ResourceStatus, 'ROLLBACK')].[Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]" \
  --output table 2>&1 | head -160
echo "::endgroup::"

echo "::group::Recent stack events (newest ${STACK_EVENTS_RECENT}, any status — timeline)"
aws cloudformation describe-stack-events --stack-name "$STACK" --region "$REGION" \
  --max-items "$STACK_EVENTS_RECENT" \
  --query 'StackEvents[*].[Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]' \
  --output table 2>&1 | head -200
echo "::endgroup::"

echo "::group::Physical ApiService (CloudFormation)"
API_PHYSICAL=$(aws cloudformation describe-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResources[?LogicalResourceId=='ApiService'].PhysicalResourceId" --output text 2>/dev/null | awk 'NF{print; exit}')
aws cloudformation describe-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResources[?LogicalResourceId=='ApiService'].[PhysicalResourceId,ResourceStatus]" --output table 2>&1
echo "::endgroup::"

SERVICE_ARN="${API_PHYSICAL//[[:space:]]/}"
if [[ -n "$SERVICE_ARN" ]] && [[ "$SERVICE_ARN" == arn:aws:apprunner:* ]]; then
  echo "::group::App Runner describe-service (API + status)"
  aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --output json 2>&1 | head -c 24000
  echo ""
  echo "::endgroup::"

  echo "::group::App Runner list-operations (recent deploy / health)"
  aws apprunner list-operations --service-arn "$SERVICE_ARN" --region "$REGION" --max-results 20 --output json 2>&1 | head -c 16000
  echo ""
  echo "::endgroup::"
else
  echo "::group::App Runner describe-service (skipped)"
  echo "No ApiService ARN in stack resources (common during rollback after delete). Pull /aws/apprunner/* logs below."
  echo "::endgroup::"
  SERVICE_ARN=""
fi

# Service id is the last path segment of the App Runner ARN (used in log group names).
SERVICE_ID=""
if [[ -n "$SERVICE_ARN" ]]; then
  SERVICE_ID="${SERVICE_ARN##*/}"
fi

echo "::group::App Runner log groups (prefix /aws/apprunner/)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n "$GROUPS_MAX"
echo "::endgroup::"

dump_apprunner_group() {
  local g="$1"
  local lines="$2"
  [[ -z "$g" ]] && return
  [[ -n "${_diag_cancel:-}" ]] && return
  echo "--- $g ---"
  aws logs tail "$g" --region "$REGION" --since "$LOG_SINCE" --format short --no-follow 2>/dev/null | tail -n "$lines" || \
    aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
      --query 'events[*].message' --output text 2>&1 | tail -n "$lines"
}

if [[ -n "$SERVICE_ID" ]]; then
  echo "::group::App Runner CloudWatch — groups matching service id ${SERVICE_ID} (expanded)"
  aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
    --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' | grep -F "$SERVICE_ID" | while read -r g; do
    dump_apprunner_group "$g" 500
  done
  echo "::endgroup::"
fi

echo "::group::App Runner CloudWatch — all recent groups (tail --since ${LOG_SINCE}, ${LINES_PER_GROUP} lines each)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' | tail -n "$GROUPS_MAX" | while read -r g; do
  dump_apprunner_group "$g" "$LINES_PER_GROUP"
done
echo "::endgroup::"

DB_BACKUP_FN="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DbBackupFunctionName'].OutputValue" --output text 2>/dev/null | awk 'NF{print; exit}')"
if [[ -n "$DB_BACKUP_FN" && "$DB_BACKUP_FN" != "None" ]]; then
  echo "::group::DbBackupFn CloudWatch (/aws/lambda/${DB_BACKUP_FN})"
  aws logs tail "/aws/lambda/${DB_BACKUP_FN}" --region "$REGION" --since "$LOG_SINCE" --format short --no-follow 2>/dev/null | tail -n 200 || \
    echo "(no recent logs — invoke may have failed before Lambda started, or IAM lacks logs:FilterLogEvents)"
  echo "::endgroup::"
fi

echo "::group::Lambda / custom resource log groups (prefix /aws/lambda/ — newest 20)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/lambda/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n 20 | while read -r g; do
  [[ -z "$g" ]] && continue
  [[ -n "${_diag_cancel:-}" ]] && continue
  echo "--- $g ---"
  aws logs tail "$g" --region "$REGION" --since "$LOG_SINCE" --format short --no-follow 2>/dev/null | tail -n 120 || \
    aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
      --query 'events[*].message' --output text 2>&1 | tail -n 120
done
echo "::endgroup::"

echo "::group::RDS log groups (prefix /aws/rds/ — if export enabled)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/rds/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n 15 | while read -r g; do
  [[ -z "$g" ]] && continue
  [[ -n "${_diag_cancel:-}" ]] && continue
  echo "--- $g ---"
  aws logs tail "$g" --region "$REGION" --since "$LOG_SINCE" --format short --no-follow 2>/dev/null | tail -n 80 || true
done
echo "::endgroup::"

echo "Tip: Search this file for [boot], Error, prisma, JWT, ECONN, NotStabilized. Ensure IAM role for GitHub deploy includes apprunner:Describe*, apprunner:ListOperations, logs:* used here."
exit 0
