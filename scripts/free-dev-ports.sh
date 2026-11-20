#!/usr/bin/env bash
# Stop stale local dev processes so `npm run dev` can bind this branch's ports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/local-dev-ports.sh
source "$ROOT/scripts/local-dev-ports.sh"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "Stopping process(es) on port $port..."
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  local i
  for i in $(seq 1 24); do
    if ! lsof -ti ":$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Force-stopping stubborn process(es) on port $port..."
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.5
  fi
}

# Always free this branch's ports, plus the shared alternates so restarts are reliable.
for port in "$API_PORT" "$WEB_PORT" "$DOCS_PORT" 3000 3010 3020 5173 5174 5175 5190 5191 4175; do
  kill_port "$port"
done

bash "$ROOT/scripts/wait-tcp-port-free.sh" "$API_PORT" 15
bash "$ROOT/scripts/wait-tcp-port-free.sh" "$WEB_PORT" 10
echo "Local ports ready: API :${API_PORT} · web :${WEB_PORT} · docs :${DOCS_PORT}"
