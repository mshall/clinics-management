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

is_orphan_connector_name() {
  local name="$1"
  case "$name" in
    kiorly-clinic-connector-v2 | kiorly-conn-nagement) return 0 ;;
    kiorly-conn-*) return 0 ;;
    *) return 1 ;;
  esac
}

list_json="$(aws apprunner list-vpc-connectors --region "$REGION" --output json 2>/dev/null || echo '{"VpcConnectors":[]}')"

deleted=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  arn="${line%%$'\t'*}"
  name="${line#*$'\t'}"

  if [[ -n "$stack_connector_arn" && "$arn" == "$stack_connector_arn" ]]; then
    echo "  keep (in stack): ${name} ${arn}"
    continue
  fi

  if is_orphan_connector_name "$name"; then
    echo "  delete orphan connector: ${name} (${arn})"
    aws apprunner delete-vpc-connector --vpc-connector-arn "$arn" --region "$REGION" || true
    deleted=$((deleted + 1))
  fi
done < <(
  echo "$list_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('VpcConnectors') or []:
    print(c.get('VpcConnectorArn', '') + '\t' + c.get('VpcConnectorName', ''))
"
)

echo "cicd-cleanup-orphan-vpc-connectors: removed ${deleted} orphan connector(s); stack holds ${stack_connector_arn:-<none>}"