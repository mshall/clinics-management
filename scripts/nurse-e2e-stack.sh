#!/usr/bin/env bash
# Kiorly Nurse E2E stack (throw-away): a second API on :3011 whose flag snapshot has every launch gate satisfied (fixture, not a real gate)
# and a second web on :5185 proxying to it. The shared dev stack (API 3010 / web 5174) keeps its gates locked.
# STACK=locked bash scripts/nurse-e2e-stack.sh starts the LOCKED variant (flags :4102, API :3012, web :5186) where the GKN1/GKN2 flags stay unsatisfied,
# so the awaiting-gate states are real; the default is the OPEN variant (flags :4101, API :3011, web :5185).
# Usage: bash scripts/nurse-e2e-stack.sh   (run from the repo root; needs `npm run build -w api` once)
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=development
FP=4101; AP=3011; WP=5185; LOCKED=""
if [ "${STACK:-open}" = "locked" ]; then FP=4102; AP=3012; WP=5186; LOCKED="nurse.care_plans,nurse.mar,nurse.family_updates,nurse.individual_kiorex_listing,clinic.lab_order_handoff"; fi
(cd apps/web && NURSE_E2E_FLAGS_PORT=$FP NURSE_E2E_LOCKED_FLAGS=$LOCKED npx tsx e2e/support/nurse-flag-snapshot-server.ts) &
sleep 2
(cd apps/api && PORT=$AP KIOREX_CONTROL_PLANE_URL=http://127.0.0.1:$FP KIOREX_FLAGS_SECRET=e2e_flags_secret KIOREX_FLAGS_POLL_MS=1000 node --enable-source-maps dist/src/main.js) &
(cd apps/web && API_PROXY_TARGET=http://127.0.0.1:$AP npx vite --port $WP --strictPort --host localhost) &
wait
