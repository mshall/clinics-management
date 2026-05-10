#!/usr/bin/env bash
# Deploy kiorly-clinics-management CDK stack from CI (GitHub Actions). Expects AWS credentials in env (OIDC or keys).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AWS_REGION="${AWS_REGION:-eu-central-1}"
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-eu-central-1}"
export CDK_DEFAULT_ACCOUNT
CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

echo "CDK deploy: account=${CDK_DEFAULT_ACCOUNT} region=${AWS_REGION}"
docker version

cd "$ROOT"
npm ci
npm run build -w web
cd infra
npm ci
npm run build

# In GitHub Actions, emit verbose CDK / construct logging for post-mortem artifacts.
CDK_DEPLOY_ARGS=(--require-approval never)
if [ "${CI:-}" = "true" ]; then
  export CDK_DEBUG="${CDK_DEBUG:-1}"
  CDK_DEPLOY_ARGS+=(--verbose)
fi
npx cdk deploy "${CDK_DEPLOY_ARGS[@]}"
