#!/usr/bin/env bash
# Stop stale local dev processes on THIS checkout's own dev ports only, so `npm run dev` binds them reliably.
# Own ports: API 3010 (apps/api/.env PORT), web 5174, docs 5176 (override with API_PORT / WEB_PORT / DOCS_PORT).
# Never touches 3000 / 5173 / 5175 / 4175: those belong to another checkout on the same machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${API_PORT:-3010}"
WEB_PORT="${WEB_PORT:-5174}"
DOCS_PORT="${DOCS_PORT:-5176}"

for p in "$API_PORT" "$WEB_PORT" "$DOCS_PORT"; do
  case "$p" in
    3000|5173|5175|4175)
      echo "Refusing to free port $p: it belongs to another checkout. Set API_PORT / WEB_PORT / DOCS_PORT to your own ports." >&2
      exit 1
      ;;
  esac
done

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "Stopping process(es) listening on own port $port..."
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  local i
  for i in $(seq 1 24); do
    if ! lsof -ti ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Force-stopping stubborn process(es) on port $port..."
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.5
  fi
}

for port in "$API_PORT" "$WEB_PORT" "$DOCS_PORT"; do
  kill_port "$port"
done

bash "$ROOT/scripts/wait-tcp-port-free.sh" "$API_PORT" 15
bash "$ROOT/scripts/wait-tcp-port-free.sh" "$WEB_PORT" 10
