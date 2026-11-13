#!/usr/bin/env bash
# Store OpenAI API key in AWS Secrets Manager and ensure App Runner uses the secret (not plain env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${OPENAI_ENV_FILE:-$ROOT/apps/api/.env}"
STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
SECRET_NAME="${OPENAI_SECRET_NAME:-$STACK_NAME/openai-api-key}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — add OPENAI_API_KEY there for this one-time upload (file stays gitignored)." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is empty in $ENV_FILE" >&2
  exit 1
fi

SECRET_ARN="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='OpenAiSecretArn'].OutputValue" \
  --output text 2>/dev/null || true)"

if [[ -z "$SECRET_ARN" || "$SECRET_ARN" == "None" ]]; then
  echo "OpenAiSecretArn output not found — deploy CDK stack first (creates $SECRET_NAME)." >&2
  SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" --query ARN --output text 2>/dev/null || true)"
fi

if [[ -z "$SECRET_ARN" || "$SECRET_ARN" == "None" ]]; then
  echo "Creating Secrets Manager secret $SECRET_NAME …"
  SECRET_ARN="$(aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --region "$REGION" \
    --description "OpenAI API key for Kiorly assistant (JSON field apiKey)" \
    --secret-string "$(OPENAI_API_KEY="$OPENAI_API_KEY" python3 -c 'import json,os; print(json.dumps({"apiKey": os.environ["OPENAI_API_KEY"]}))')" \
    --query ARN --output text)"
  echo "Created secret: $SECRET_ARN"
else
  echo "Updating secret $SECRET_ARN …"
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_ARN" \
    --region "$REGION" \
    --secret-string "$(OPENAI_API_KEY="$OPENAI_API_KEY" python3 -c 'import json,os; print(json.dumps({"apiKey": os.environ["OPENAI_API_KEY"]}))')"
fi

SERVICE_ARN="$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "StackResources[?ResourceType=='AWS::AppRunner::Service'].PhysicalResourceId" \
  --output text 2>/dev/null || true)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "OK  Secret stored. Deploy CDK so App Runner references OpenAiSecretArn (no plain OPENAI_API_KEY)."
  exit 0
fi

OPENAI_KEY_FIELD_ARN="${SECRET_ARN}:apiKey::"
export OPENAI_KEY_FIELD_ARN OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"

INSTANCE_ROLE_ARN="$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --query "Service.InstanceConfiguration.InstanceRoleArn" --output text)"
if [[ -n "$INSTANCE_ROLE_ARN" && "$INSTANCE_ROLE_ARN" != "None" ]]; then
  ROLE_NAME="${INSTANCE_ROLE_ARN##*/}"
  POLICY_TMP="$(mktemp)"
  SECRET_ARN="$SECRET_ARN" python3 <<'PY' >"$POLICY_TMP"
import json, os
arn = os.environ["SECRET_ARN"]
prefix = arn.rsplit("-", 1)[0] + "-*"
print(json.dumps({
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        "Resource": [arn, prefix],
    }],
}))
PY
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "KiorlyOpenAiSecretRead" \
    --policy-document "file://$POLICY_TMP"
  rm -f "$POLICY_TMP"
fi

echo "Removing plain-text OPENAI_API_KEY from App Runner (if present) and binding Secrets Manager …"

TMP_CFG="$(mktemp)"
aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --output json | python3 -c "
import json, os, sys
d = json.load(sys.stdin)
src = d['Service']['SourceConfiguration']
repo = src['ImageRepository']
cfg = dict(repo.get('ImageConfiguration') or {})
vars = dict(cfg.get('RuntimeEnvironmentVariables') or {})
vars.pop('OPENAI_API_KEY', None)
vars['OPENAI_MODEL'] = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
cfg['RuntimeEnvironmentVariables'] = vars
raw_secrets = cfg.get('RuntimeEnvironmentSecrets') or {}
if isinstance(raw_secrets, list):
    secrets = {s['Name']: s['Value'] for s in raw_secrets}
else:
    secrets = dict(raw_secrets)
field_arn = os.environ['OPENAI_KEY_FIELD_ARN']
secrets['OPENAI_API_KEY'] = field_arn
cfg['RuntimeEnvironmentSecrets'] = secrets
out = {
    'ImageRepository': {
        'ImageIdentifier': repo['ImageIdentifier'],
        'ImageRepositoryType': repo['ImageRepositoryType'],
        'ImageConfiguration': cfg,
    }
}
json.dump({'SourceConfiguration': out}, sys.stdout)
" >"$TMP_CFG"

aws apprunner update-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --cli-input-json "file://$TMP_CFG" \
  --output json >/dev/null

rm -f "$TMP_CFG"
echo "OK  OpenAI key stored in Secrets Manager; App Runner uses OPENAI_API_KEY secret reference."
