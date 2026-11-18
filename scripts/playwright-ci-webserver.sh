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

echo "[playwright-ci] starting Vite…"
npm run dev -w web &
WEB_PID=$!

VITE_WAIT_SEC="${PLAYWRIGHT_VITE_WAIT_SEC:-180}"
echo "[playwright-ci] warming Vite (first /login compile on CI can exceed Playwright's HTTP poll)…"
for _ in $(seq 1 "$VITE_WAIT_SEC"); do
  body="$(curl -sf --max-time 3 "http://127.0.0.1:5173/login" 2>/dev/null || true)"
  if echo "$body" | grep -q 'id="email"'; then
    echo "[playwright-ci] Vite login shell ready"
    break
  fi
  sleep 1
done

wait "$API_PID" "$WEB_PID"