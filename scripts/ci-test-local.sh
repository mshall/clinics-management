#!/usr/bin/env bash
# Mirrors .github/workflows/ci-test-reusable.yml (local Postgres via db:ensure).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CI=true
export NODE_ENV=test
export PDPC_EGYPT_LAUNCH_GATE_BYPASS="${PDPC_EGYPT_LAUNCH_GATE_BYPASS:-1}"
export ALLOW_DEMO_SEED="${ALLOW_DEMO_SEED:-true}"
# Invitation integration tests construct ConfigService({ APP_WEB_URL: "https://app.test" }),
# but Nest prefers process.env; apps/api/.env often sets localhost for Vite.
export APP_WEB_URL="${APP_WEB_URL:-https://app.test}"

bash scripts/ensure-local-dev-db.sh
npm run prisma:generate -w api
npm run db:deploy -w api
npm run db:seed -w api
npm run typecheck
npm run test:unit -w web
npm run test:unit -w api
npm run test:integration -w api
npm run test:money-coverage -w api
npm run build -w api && npm run build -w web
if command -v npx >/dev/null 2>&1 && npx playwright --version >/dev/null 2>&1; then
  npm run test:e2e:golden -w web
else
  echo "ci-test-local: skip E2E (install Playwright: npx playwright install chromium)"
fi

echo "ci-test-local: all steps passed (same gate as GitHub CI test job)."