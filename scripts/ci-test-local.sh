#!/usr/bin/env bash
# Mirrors .github/workflows/ci-test-reusable.yml (local Postgres via db:ensure).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CI=true
export NODE_ENV=test
export ALLOW_DEMO_SEED="${ALLOW_DEMO_SEED:-true}"

bash scripts/ensure-local-dev-db.sh
NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund --prefix infra
npm run prisma:generate -w api
npm run db:deploy -w api
npm run db:seed -w api
npm run typecheck
npm run test:unit -w web
npm run test:unit -w api
(
  cd infra
  export AWS_EC2_METADATA_DISABLED=true CDK_DEFAULT_ACCOUNT=111111111111
  npm run build
  npx cdk synth -c hostCell=frankfurt -c deployRegion=eu-central-1 --quiet
  npx cdk synth -c hostCell=cairo -c deployRegion=me-south-1 --quiet
)
GITHUB_ACTIONS=true npm run test:unit --prefix infra
npm run test:integration -w api

echo "ci-test-local: all steps passed (same gate as GitHub CI test job)."