#!/usr/bin/env bash
# Kiorly Nurse E2E stack (throw-away): a second API on :3011 whose flag snapshot has every launch gate satisfied (fixture, not a real gate)
# and a second web on :5175 proxying to it. The shared dev stack (API 3010 / web 5174) keeps its gates locked.
# Usage: bash scripts/nurse-e2e-stack.sh   (run from the repo root; needs `npm run build -w api` once)
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=development
(cd apps/web && npx tsx e2e/support/nurse-flag-snapshot-server.ts) &
sleep 2
(cd apps/api && PORT=3011 KIOREX_CONTROL_PLANE_URL=http://127.0.0.1:4101 KIOREX_FLAGS_SECRET=e2e_flags_secret KIOREX_FLAGS_POLL_MS=1000 node --enable-source-maps dist/src/main.js) &
(cd apps/web && API_PROXY_TARGET=http://127.0.0.1:3011 npx vite --port 5175 --host localhost) &
wait
