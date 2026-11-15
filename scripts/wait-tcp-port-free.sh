#!/usr/bin/env bash
# Wait until nothing listens on the given TCP port (after free-dev-ports).
set -euo pipefail

PORT="${1:?usage: wait-tcp-port-free.sh <port> [max_seconds]}"
MAX_SEC="${2:-30}"

for _ in $(seq 1 "$((MAX_SEC * 4))"); do
  if ! lsof -ti ":$PORT" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 0.25
done

echo "Port $PORT still in use after ${MAX_SEC}s" >&2
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
exit 1