#!/usr/bin/env bash
# Fast web-only deploy: build SPA → S3 sync → CloudFront invalidate.
# Does NOT rebuild the API Docker image or update App Runner.
# SPA version truth is /build-id.json (the web client ignores a stale App Runner WEB_BUILD_ID).
# Uploads bucket (patient/encounter/operation PHI) is never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
export GITHUB_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"

echo "Web-only deploy: stack=${STACK_NAME} region=${REGION} sha=${GITHUB_SHA}"

WEB_BUCKET="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" \
  --output text 2>/dev/null || true)"

# Fallback until the next full CDK deploy publishes WebBucketName.
if [[ -z "$WEB_BUCKET" || "$WEB_BUCKET" == "None" ]]; then
  WEB_BUCKET="$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::S3::Bucket' && contains(LogicalResourceId, 'WebBucket')].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true)"
fi

DIST_ID="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text 2>/dev/null || true)"

if [[ -z "$DIST_ID" || "$DIST_ID" == "None" ]]; then
  DIST_ID="$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true)"
fi

if [[ -z "$WEB_BUCKET" || "$WEB_BUCKET" == "None" ]]; then
  echo "::error::Could not resolve WebBucket from stack ${STACK_NAME}"
  exit 1
fi
if [[ -z "$DIST_ID" || "$DIST_ID" == "None" ]]; then
  echo "::error::Could not resolve CloudFront distribution from stack ${STACK_NAME}"
  exit 1
fi

# Guard: never sync to the uploads/PHI bucket.
if [[ "$WEB_BUCKET" == *apiuploads* || "$WEB_BUCKET" == *ApiUploads* ]]; then
  echo "::error::Refusing web sync to uploads bucket: $WEB_BUCKET"
  exit 1
fi

echo "Web bucket: s3://${WEB_BUCKET}"
echo "CloudFront: ${DIST_ID}"

if [[ ! -d node_modules ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund
  else
    npm ci --no-audit --no-fund
  fi
fi

npm run build -w web

if [[ ! -d apps/web/dist ]]; then
  echo "::error::apps/web/dist missing after build"
  exit 1
fi

# Static SPA only — prune stale assets on the web bucket (never ApiUploadsBucket).
aws s3 sync apps/web/dist "s3://${WEB_BUCKET}" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' --region "$REGION" >/dev/null

echo "OK  web-only deploy: synced SPA and invalidated CloudFront"
