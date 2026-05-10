#!/usr/bin/env bash
# Run from GitHub Actions after a failed CDK deploy. Collects CFN + App Runner log context (no secrets).
# CloudFormation cannot "resume from step" or skip failed resources; a failed change rolls back or leaves
# ROLLBACK_COMPLETE — the fix is code/config + a new deploy (often after deleting the stack if CREATE failed).
set +e
STACK="${CDK_STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"

echo "::group::CloudFormation stack"
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].{Name:StackName,Status:StackStatus,Reason:StackStatusReason}' --output table 2>&1
echo "::endgroup::"

echo "::group::Stack events (FAILED / ROLLBACK)"
aws cloudformation describe-stack-events --stack-name "$STACK" --region "$REGION" \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED') || contains(ResourceStatus, 'ROLLBACK')].[Timestamp,LogicalResourceId,ResourceStatus,ResourceStatusReason]" \
  --output table 2>&1 | head -120
echo "::endgroup::"

echo "::group::Physical ApiService (if still recorded)"
aws cloudformation describe-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResources[?LogicalResourceId=='ApiService'].[PhysicalResourceId,ResourceStatus]" --output table 2>&1
echo "::endgroup::"

echo "::group::App Runner log groups (prefix /aws/apprunner/)"
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'sort_by(logGroups,&logGroupName)[*].logGroupName' --output text 2>&1 | tr '\t' '\n' | tail -20
echo "::endgroup::"

echo "::group::Recent App Runner application logs (best-effort, last 15 min)"
START_MS=$(( $(date +%s) * 1000 - 900000 ))
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "/aws/apprunner/" \
  --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' | tail -5 | while read -r g; do
  [[ -z "$g" ]] && continue
  echo "--- $g ---"
  aws logs filter-log-events --region "$REGION" --log-group-name "$g" --start-time "$START_MS" \
    --query 'events[*].message' --output text 2>&1 | tail -80
done
echo "::endgroup::"

echo "Tip: NotStabilized = container never passed App Runner health checks. Fix app/health/migrate/image, then redeploy."
exit 0
