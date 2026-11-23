#!/usr/bin/env bash
# Run Playwright with branch-local ports outside CI; keep CI on 3010/5174 via playwright-ci-webserver.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

free_listen_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[playwright-ports] freeing :$port ($pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 0.2
    fi
  fi
}

if [[ "${CI:-}" == "true" || "${CI:-}" == "1" ]]; then
  # Fixed CI ports — do not inherit main's 3020/5190 from the developer shell.
  export PORT=3010
  export API_PORT=3010
  export WEB_PORT=5174
  export API_PROXY_TARGET=http://127.0.0.1:3010
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:5174}"
  export VITE_DEV_API_PORT=3010
  unset DOCS_PORT || true
  # Playwright refuses to start webServer when the ready URL already answers and
  # reuseExistingServer is false (CI). Clear orphans from a prior interrupted run
  # before Playwright's preflight check.
  free_listen_port "$PORT"
  free_listen_port "$WEB_PORT"
else
  # shellcheck source=scripts/local-dev-ports.sh
  source "$ROOT/scripts/local-dev-ports.sh"
fi

exec npx playwright test "$@"
