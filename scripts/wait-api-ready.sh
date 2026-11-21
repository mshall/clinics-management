#!/usr/bin/env bash
# Block until Nest API is accepting proxied traffic (readiness + stable consecutive checks).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${API_PORT:-3010}"
READY_URL="http://127.0.0.1:${API_PORT}/api/v1/health/ready"
LIVE_URL="http://127.0.0.1:${API_PORT}/api/v1/health/live"
MAX_SEC="${1:-120}"

echo "Waiting for API readiness at ${READY_URL} ..."

# After a restart, ignore any dying listener that still answers /live briefly.
for _ in $(seq 1 40); do
  if ! curl -sf --max-time 1 "$LIVE_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

consecutive=0
for _ in $(seq 1 "$((MAX_SEC * 2))"); do
  body="$(curl -sf --max-time 2 "$READY_URL" 2>/dev/null || true)"
  if echo "$body" | grep -q '"status":"ok"' && echo "$body" | grep -q '"database":"ok"'; then
    consecutive=$((consecutive + 1))
    if [ "$consecutive" -ge 3 ]; then
      echo "API listening on http://127.0.0.1:${API_PORT}/api/v1 (database ok)"
      exit 0
    fi
  else
    consecutive=0
  fi
  sleep 0.5
done

echo "API did not become ready within ${MAX_SEC}s (need /api/v1/health/ready with database ok)." >&2
echo "From repo root: npm run db:ensure && npm run dev" >&2
exit 1