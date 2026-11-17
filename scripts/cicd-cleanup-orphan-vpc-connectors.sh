#!/usr/bin/env bash
# Remove unused App Runner VPC connectors left by failed CDK replacements (create-before-delete).
# Safe: never deletes the connector currently registered in CloudFormation for this stack.
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"

stack_connector_arn="$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?LogicalResourceId=='AppRunnerVpcConnector'].PhysicalResourceId" \
    --output text 2>/dev/null || true
)"

if [[ "$stack_connector_arn" == "None" ]]; then
  stack_connector_arn=""
fi

# Names from failed deploy attempts — never delete the connector currently bound to the stack ARN.
ORPHAN_NAME_PATTERNS=(
  "kiorly-clinic-connector-v2"
  "kiorly-conn-nagement"
  "kiorly-conn-frankfurt"
)

list_json="$(aws apprunner list-vpc-connectors --region "$REGION" --output json 2>/dev/null || echo '{"VpcConnectors":[]}')"

deleted=0
DELETE_ARNS=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  arn="${line%%$'\t'*}"
  name="${line#*$'\t'}"

  if [[ -n "$stack_connector_arn" && "$arn" == "$stack_connector_arn" ]]; then
    echo "  keep (in stack): ${name} ${arn}"
    continue
  fi

  should_delete=0
  for pattern in "${ORPHAN_NAME_PATTERNS[@]}"; do
    if [[ "$name" == "$pattern" ]]; then
      should_delete=1
      break
    fi
  done

  if [[ "$should_delete" -eq 1 ]]; then
    echo "  delete orphan connector: ${name} (${arn})"
    if aws apprunner delete-vpc-connector --vpc-connector-arn "$arn" --region "$REGION" 2>/dev/null; then
      DELETE_ARNS+=("$arn")
      deleted=$((deleted + 1))
    fi
  fi
done < <(
  echo "$list_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('VpcConnectors') or []:
    print(c.get('VpcConnectorArn', '') + '\t' + c.get('VpcConnectorName', ''))
"
)

if [[ "${#DELETE_ARNS[@]}" -gt 0 ]]; then
  echo "  waiting for connector delete to finish (avoids immediate AlreadyExists on CDK replace)…"
  deadline=$(( $(date +%s) + 300 ))
  all_clear=0
  while [[ $(date +%s) -lt $deadline ]]; do
    remaining=0
    for arn in "${DELETE_ARNS[@]}"; do
      if aws apprunner describe-vpc-connector --vpc-connector-arn "$arn" --region "$REGION" &>/dev/null; then
        remaining=$((remaining + 1))
      fi
    done
    if [[ "$remaining" -eq 0 ]]; then
      echo "  all orphan connectors deleted"
      all_clear=1
      break
    fi
    echo "  still deleting (${remaining} connector(s))…"
    sleep 10
  done
  if [[ "$all_clear" -ne 1 ]]; then
    echo "::warning::Timed out waiting for VPC connector delete — CDK deploy may hit AlreadyExists"
  fi
fi

echo "cicd-cleanup-orphan-vpc-connectors: removed ${deleted} orphan connector(s); stack holds ${stack_connector_arn:-<none>}"