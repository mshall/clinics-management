#!/usr/bin/env bash
# Mirrors .github/workflows/ci-test-reusable.yml (local Postgres via db:ensure).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CI=true
export NODE_ENV=test
export ALLOW_DEMO_SEED="${ALLOW_DEMO_SEED:-true}"

bash scripts/ensure-local-dev-db.sh
npm run prisma:generate -w api
npm run db:deploy -w api
npm run db:seed -w api
npm run typecheck
npm run test:unit -w web
npm run test:unit -w api
npm run test:integration -w api

echo "ci-test-local: all steps passed (same gate as GitHub CI test job)."