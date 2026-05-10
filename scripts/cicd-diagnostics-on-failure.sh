#!/usr/bin/env bash
# Run from GitHub Actions after a failed CDK deploy. Collects CFN + CloudWatch context (no secrets).
# Tunable env: LOG_LOOKBACK_MS (default 2h), LOG_GROUPS_MAX (default 35), LOG_LINES_PER_GROUP (default 250),
#              STACK_EVENTS_RECENT (default 60).
set +e
STACK="${CDK_STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
LOOKBACK_MS="${LOG_LOOKBACK_MS:-7200000}" # 2 hours
START_MS=$(( $(date +%s) * 1000 - LOOKBACK_MS ))
GROUPS_MAX="${LOG_GROUPS_MAX:-35}"
LINES_PER_GROUP="${LINES_PER_GROUP:-250}"
STACK_EVENTS_RECENT="${STACK_EVENTS_RECENT:-60}"

echo "::group::CloudFormation stack"
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].{Name:StackName,Status:StackStatus,Reason:StackStatusReason}' --output table 2>&1
echo "::endgroup::"

echo "::group::Stack events (FAILED / ROLLBACK)"
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

echo "::group::Physical ApiService (if still recorded)"
aws cloudformation describe-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResources[?LogicalResourceId=='ApiService'].[PhysicalResourceId,ResourceStatus]" --output table 2>&1
echo "::endgroup::"

echo "::group::App Runner log groups (prefix /aws/apprunner/)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n "$GROUPS_MAX"
echo "::endgroup::"

echo "::group::App Runner application / service logs (lookback ${LOOKBACK_MS}ms, up to ${GROUPS_MAX} groups, ${LINES_PER_GROUP} lines each)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' | tail -n "$GROUPS_MAX" | while read -r g; do
  [[ -z "$g" ]] && continue
  echo "--- $g ---"
  aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
    --query 'events[*].message' --output text 2>&1 | tail -n "$LINES_PER_GROUP"
done
echo "::endgroup::"

echo "::group::Lambda / custom resource log groups (prefix /aws/lambda/ — newest 20, CDK custom resources)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/lambda/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n 20 | while read -r g; do
  [[ -z "$g" ]] && continue
  echo "--- $g ---"
  aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
    --query 'events[*].message' --output text 2>&1 | tail -n 120
done
echo "::endgroup::"

echo "::group::RDS log groups (prefix /aws/rds/ — if export enabled)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/rds/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -n 15 | while read -r g; do
  [[ -z "$g" ]] && continue
  echo "--- $g ---"
  aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
    --query 'events[*].message' --output text 2>&1 | tail -n 80
done
echo "::endgroup::"

echo "Tip: NotStabilized = App Runner never passed health checks. Use deploy-full.log (artifact) + App Runner groups above."
exit 0
