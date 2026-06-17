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
# CI: trim npm noise — deprecations (rimraf/glob/prebuild-install, etc.) are almost always transitive
# from Prisma/@cursor-sdk/sqlite3/native toolchains, not direct app code. --no-audit/--no-fund skip the
# summary footer; LOGLEVEL=error applies only to this npm ci (workspace builds keep default logging).
if [[ "${CI:-}" == "true" ]]; then
  NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund
else
  npm ci --no-audit --no-fund
fi
npm run build -w web
cd infra
if [[ "${CI:-}" == "true" ]]; then
  NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund
else
  npm ci --no-audit --no-fund
fi
if [[ ! -d node_modules/aws-cdk-lib ]]; then
  echo "::error::infra npm ci did not install aws-cdk-lib — CDK TypeScript build will fail."
  exit 1
fi
# EC2 SecurityGroup GroupDescription must be ASCII-only; fail fast before CloudFormation.
npm run check:ascii-descriptions
npm run build

# In GitHub Actions, emit verbose CDK / construct logging for post-mortem artifacts.
CDK_DEPLOY_ARGS=(--require-approval never)
if [ "${CI:-}" = "true" ]; then
  export CDK_DEBUG="${CDK_DEBUG:-1}"
  CDK_DEPLOY_ARGS+=(--verbose)
fi
npx cdk synth "${CDK_DEPLOY_ARGS[@]}"
npm run check:ascii-cfn
npx cdk deploy --app cdk.out "${CDK_DEPLOY_ARGS[@]}"
