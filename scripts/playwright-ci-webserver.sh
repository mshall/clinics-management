#!/usr/bin/env bash
# Playwright webServer on CI: API + web only (no docs, no db:ensure — workflow already migrated/seeded).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_WAIT_SEC="${PLAYWRIGHT_API_WAIT_SEC:-180}"

cleanup() {
  kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ ! -f "$ROOT/apps/api/dist/src/main.js" ]; then
  echo "[playwright-ci] building API (faster than nest --watch on cold CI)…"
  npm run build -w api
fi

echo "[playwright-ci] starting API (DATABASE_URL from CI)…"
npm run start -w api &
API_PID=$!

bash "$ROOT/scripts/wait-api-ready.sh" "$API_WAIT_SEC"

if [ "${PLAYWRIGHT_WEB_MODE:-}" = "preview" ] || [ -n "${CI:-}" ]; then
  if [ ! -d "$ROOT/apps/web/dist" ]; then
    echo "[playwright-ci] building web (CI preview — no Vite cold compile)…"
    npm run build -w web
  fi
  echo "[playwright-ci] starting Vite preview…"
  npm run preview -w web &
else
  echo "[playwright-ci] starting Vite dev…"
  npm run dev -w web &
fi
WEB_PID=$!

wait "$API_PID" "$WEB_PID"