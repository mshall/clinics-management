#!/usr/bin/env bash
# Stop stale local dev processes so `npm run dev` binds 3000 + 5173 reliably.
set -euo pipefail

for port in 3000 5173 5174; do
  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping process(es) on port $port..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
done
