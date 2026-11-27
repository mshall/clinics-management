#!/usr/bin/env bash
# Kiorly Pay E2E stack (throw-away, PRIVATE ports and database): a Kiorly API whose flag snapshot has every launch gate satisfied (fixture, not a real gate),
# plus a web proxying to it. Defaults: flags :4412, API :3412, web :5412 (never 3000/5173/5175 or the shared dev stack's 3010/5174).
# Needs DATABASE_URL of a PRIVATE database named test_*, e2e_* or gap_* (migrated and seeded) and `npm run build -w api` once.
#   DATABASE_URL=postgresql://postgres@localhost:5433/test_clinic_payui?schema=public bash scripts/pay-e2e-stack.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a private test_* database}"
case "$DATABASE_URL" in *"/test_"*|*"/e2e_"*|*"/gap_"*) ;; *) echo "refusing: DATABASE_URL must point at a private test_*, e2e_* or gap_* database" >&2; exit 1;; esac
FP="${PAY_E2E_FLAGS_PORT:-4412}"; AP="${PAY_E2E_API_PORT:-3412}"; WP="${PAY_E2E_WEB_PORT:-5412}"
export NODE_ENV=development JWT_SECRET="${JWT_SECRET:-pay-e2e-only-not-production-min-32-characters}" KIOREX_PAY_LINK_BASE_URL="${KIOREX_PAY_LINK_BASE_URL:-https://pay.kiorex.example}" APP_WEB_URL="http://localhost:$WP" PDPC_EGYPT_LAUNCH_GATE_BYPASS=1
(cd apps/web && NURSE_E2E_FLAGS_PORT=$FP npx tsx e2e/support/nurse-flag-snapshot-server.ts) &
sleep 2
(cd apps/api && PORT=$AP KIOREX_CONTROL_PLANE_URL=http://127.0.0.1:$FP KIOREX_FLAGS_SECRET=e2e_flags_secret KIOREX_FLAGS_POLL_MS=1000 node --enable-source-maps dist/src/main.js) &
(cd apps/web && API_PROXY_TARGET=http://127.0.0.1:$AP VITE_DEV_API_PORT=$AP npx vite --port $WP --strictPort --host localhost) &
trap 'kill 0' EXIT
wait
