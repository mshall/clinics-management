#!/usr/bin/env bash
# Deploy kiorly-clinics-management CDK stack from CI (GitHub Actions). Expects AWS credentials in env (OIDC or keys).
# Local / branch: kiorex uses profile aws-kiorex-profile via scripts/resolve-aws-profile.sh
#
# DEPLOY_SCOPE (optional):
#   full (default) — API image + web SPA via CDK
#   api            — API/CDK only; restore current SPA from S3 so WebDeploy asset stays unchanged
#   web            — SPA S3 sync + CloudFront only (no App Runner / Docker rebuild)
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
export GITHUB_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
DEPLOY_SCOPE="${DEPLOY_SCOPE:-full}"

echo "CDK deploy: scope=${DEPLOY_SCOPE} AWS_PROFILE=${AWS_PROFILE:-(default)} account=${CDK_DEFAULT_ACCOUNT} region=${AWS_REGION}"

if [[ "$DEPLOY_SCOPE" == "web" ]]; then
  bash "$ROOT/scripts/cicd-deploy-web-only.sh"
  exit 0
fi

docker version

cd "$ROOT"

# Prefer restored node_modules from Actions cache; only npm ci when missing.
if [[ ! -d node_modules ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund
  else
    npm ci --no-audit --no-fund
  fi
fi

restore_web_dist_from_s3() {
  local stack_name="${STACK_NAME:-kiorly-clinics-management}"
  local bucket
  bucket="$(aws cloudformation describe-stack-resources \
    --stack-name "$stack_name" \
    --region "$AWS_REGION" \
    --query "StackResources[?ResourceType=='AWS::S3::Bucket' && contains(LogicalResourceId, 'WebBucket')].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true)"
  if [[ -z "$bucket" || "$bucket" == "None" ]]; then
    echo "WARN  could not resolve WebBucket — building web so synth has a dist/"
    VITE_KIORLY_HOME_URL="${VITE_KIORLY_HOME_URL:-$(node scripts/resolve-kiorly-home-url.mjs)}" npm run build -w web
    return 0
  fi
  if [[ "$bucket" == *apiuploads* ]]; then
    echo "::error::Refusing to pull uploads bucket as web dist"
    exit 1
  fi
  echo "API-only: restoring apps/web/dist from s3://${bucket} (keeps WebDeploy asset stable)"
  rm -rf apps/web/dist
  mkdir -p apps/web/dist
  aws s3 sync "s3://${bucket}" apps/web/dist --region "$AWS_REGION"
}

if [[ "$DEPLOY_SCOPE" == "api" ]]; then
  restore_web_dist_from_s3
else
  VITE_KIORLY_HOME_URL="${VITE_KIORLY_HOME_URL:-$(node scripts/resolve-kiorly-home-url.mjs)}" npm run build -w web
fi

node scripts/check-boot-proxy-order.mjs
cd infra
if [[ ! -d node_modules/aws-cdk-lib ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund
  else
    npm ci --no-audit --no-fund
  fi
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

# Only stamp WEB_BUILD_ID on App Runner when the SPA is part of this deploy.
# API-only keeps the previous env value so CloudFormation does not churn App Runner for SPA versioning.
CDK_DEPLOY_ARGS=(--require-approval never)
if [[ "$DEPLOY_SCOPE" != "api" ]]; then
  CDK_DEPLOY_ARGS+=(-c "webBuildId=${GITHUB_SHA}")
fi
# Verbose CDK / CDK_DEBUG only when explicitly requested (huge logs slow the job).
if [[ "${CI:-}" == "true" && "${CDK_VERBOSE:-}" == "1" ]]; then
  export CDK_DEBUG=1
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
