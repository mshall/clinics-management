#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Waiting for API at http://localhost:3000/api/v1/health/live ..."
for _ in $(seq 1 120); do
  if curl -sf http://localhost:3000/api/v1/health/live >/dev/null 2>&1; then
    echo "API ready — starting clinic app at http://localhost:5173/login (docs portal: http://localhost:5175)"
    exec npm run dev -w web
  fi
  sleep 0.5
done

echo "API did not become ready within 60s." >&2
exit 1
