#!/usr/bin/env bash
# Deploy kiorly-clinics-management CDK stack from CI (GitHub Actions). Expects AWS credentials in env (OIDC or keys).
# Local / branch: kiorex uses profile aws-kiorex-profile via scripts/resolve-aws-profile.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Named profiles are for local CLI only. GitHub Actions already injects keys/OIDC into the
# default credential chain — setting AWS_PROFILE=aws-kiorex-profile there fails (profile missing).
RESOLVED_PROFILE="$(bash "$ROOT/scripts/resolve-aws-profile.sh")"
if [[ -n "$RESOLVED_PROFILE" && -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_SESSION_TOKEN:-}" && -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]]; then
  export AWS_PROFILE="$RESOLVED_PROFILE"
fi
export AWS_REGION="${AWS_REGION:-eu-central-1}"
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-eu-central-1}"
export CDK_DEFAULT_ACCOUNT
CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

echo "CDK deploy: AWS_PROFILE=${AWS_PROFILE:-(default)} account=${CDK_DEFAULT_ACCOUNT} region=${AWS_REGION}"
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
export GITHUB_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
npm run build -w web
node scripts/check-boot-proxy-order.mjs
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
npx cdk synth --quiet
npm run check:ascii-descriptions

# In GitHub Actions, emit verbose CDK / construct logging for post-mortem artifacts.
CDK_DEPLOY_ARGS=(--require-approval never -c "webBuildId=${GITHUB_SHA}")
if [ "${CI:-}" = "true" ]; then
  export CDK_DEBUG="${CDK_DEBUG:-1}"
  CDK_DEPLOY_ARGS+=(--verbose)
fi
npx cdk synth "${CDK_DEPLOY_ARGS[@]}"
npm run check:ascii-cfn
npm run check:apprunner-connector-cfn
bash "$ROOT/scripts/cicd-cleanup-orphan-vpc-connectors.sh"
npx cdk deploy --app cdk.out "${CDK_DEPLOY_ARGS[@]}"
APPRUNNER_OK=0
bash "$ROOT/scripts/cicd-wait-apprunner-deploy.sh" || APPRUNNER_OK=1
bash "$ROOT/scripts/cicd-post-deploy-seed.sh"
if [[ "$APPRUNNER_OK" -ne 0 ]]; then
  echo "::error::App Runner UPDATE_SERVICE did not succeed — seed ran but API image may be rolled back"
  exit 1
fi
