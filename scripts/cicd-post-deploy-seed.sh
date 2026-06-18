#!/usr/bin/env bash
# Invoke the CDK-provisioned DB seed Lambda after deploy (idempotent demo users on RDS).
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
AWS_REGION="${AWS_REGION:-eu-central-1}"

echo "Post-deploy seed: stack=${STACK_NAME} region=${AWS_REGION}"

FN="$(
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='DbSeedFunctionName'].OutputValue" \
    --output text 2>/dev/null || true
)"

if [[ -z "$FN" || "$FN" == "None" || "$FN" == "null" ]]; then
  echo "DbSeedFunctionName output not found — first deploy with seed Lambda; skipping post-deploy seed."
  exit 0
fi

echo "Invoking seed Lambda: ${FN}"
OUT="$(mktemp)"
INVOKE_META="$(mktemp)"
aws lambda invoke \
  --function-name "$FN" \
  --region "$AWS_REGION" \
  --cli-read-timeout 900 \
  --cli-connect-timeout 60 \
  --output json \
  "$OUT" > "$INVOKE_META"

echo "Lambda invoke metadata:"
cat "$INVOKE_META"
echo ""
echo "Lambda payload:"
cat "$OUT"
echo ""

if grep -q '"ok":true' "$OUT"; then
  echo "OK  post-deploy idempotent seed"
  exit 0
fi

if grep -q '"FunctionError"' "$INVOKE_META"; then
  echo "WARN  Lambda invoke reported FunctionError — checking CloudWatch for completed OK …"
  if aws logs tail "/aws/lambda/${FN}" --region "$AWS_REGION" --since 15m --format short --no-follow 2>/dev/null \
    | tail -n 80 | grep -q '\[db-seed\] completed OK'; then
    echo "OK  post-deploy idempotent seed (CloudWatch confirmed success despite FunctionError)"
    exit 0
  fi
  echo "::error::Post-deploy seed Lambda failed. Check CloudWatch: /aws/lambda/${FN}"
  aws logs tail "/aws/lambda/${FN}" --region "$AWS_REGION" --since 45m --format short --no-follow 2>/dev/null | tail -n 120 || true
  exit 1
fi

echo "::error::Seed Lambda returned unexpected payload"
exit 1
