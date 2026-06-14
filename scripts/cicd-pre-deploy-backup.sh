#!/usr/bin/env bash
# Invoke the CDK-provisioned DB backup Lambda before deploy (emails pg_dump to BACKUP_EMAIL_TO).
set -euo pipefail

STACK_NAME="${CDK_STACK_NAME:-kiorly-clinics-management}"
AWS_REGION="${AWS_REGION:-eu-central-1}"

echo "Pre-deploy backup: stack=${STACK_NAME} region=${AWS_REGION}"

FN="$(
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='DbBackupFunctionName'].OutputValue" \
    --output text 2>/dev/null || true
)"

if [[ -z "$FN" || "$FN" == "None" || "$FN" == "null" ]]; then
  echo "DbBackupFunctionName output not found — first deploy or stack not yet created; skipping pre-deploy backup."
  exit 0
fi

echo "Invoking backup Lambda: ${FN}"
OUT="$(mktemp)"
INVOKE_META="$(mktemp)"
aws lambda invoke \
  --function-name "$FN" \
  --region "$AWS_REGION" \
  --cli-read-timeout 600 \
  --cli-connect-timeout 60 \
  --output json \
  "$OUT" > "$INVOKE_META"

echo "Lambda invoke metadata:"
cat "$INVOKE_META"
echo ""
echo "Lambda payload:"
cat "$OUT"
echo ""

if grep -q '"FunctionError"' "$INVOKE_META"; then
  echo "::error::Pre-deploy database backup Lambda failed. Verify SES identity for kiorlyclinics@gmail.com and check CloudWatch logs."
  rm -f "$OUT" "$INVOKE_META"
  exit 1
fi

if ! grep -q '"ok":true' "$OUT"; then
  echo "::warning::Backup Lambda returned unexpected payload — review CloudWatch logs for ${FN}"
fi

rm -f "$OUT" "$INVOKE_META"
