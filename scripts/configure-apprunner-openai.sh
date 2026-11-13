#!/usr/bin/env bash
# Set OPENAI_API_KEY on the App Runner API from apps/api/.env (never commit the key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${OPENAI_ENV_FILE:-$ROOT/apps/api/.env}"
STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — add OPENAI_API_KEY there first." >&2
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

export OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"

SERVICE_ARN="$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "StackResources[?ResourceType=='AWS::AppRunner::Service'].PhysicalResourceId" \
  --output text 2>/dev/null || true)"

if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "Could not resolve App Runner service from stack $STACK_NAME" >&2
  exit 1
fi

echo "Updating App Runner OpenAI env on $SERVICE_ARN"

TMP_CFG="$(mktemp)"
aws apprunner describe-service --service-arn "$SERVICE_ARN" --region "$REGION" --output json | OPENAI_API_KEY="$OPENAI_API_KEY" OPENAI_MODEL="$OPENAI_MODEL" python3 -c "
import json, os, sys
d = json.load(sys.stdin)
src = d['Service']['SourceConfiguration']
repo = src['ImageRepository']
cfg = dict(repo.get('ImageConfiguration') or {})
vars = dict(cfg.get('RuntimeEnvironmentVariables') or {})
vars['OPENAI_API_KEY'] = os.environ['OPENAI_API_KEY']
vars['OPENAI_MODEL'] = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
cfg['RuntimeEnvironmentVariables'] = vars
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
echo "OK  App Runner update started — wait for Running status, then test the assistant on CloudFront."
