#!/usr/bin/env bash
# Run Playwright with branch-local ports outside CI; keep CI on 3010/5174 via playwright-ci-webserver.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

if [[ "${CI:-}" == "true" || "${CI:-}" == "1" ]]; then
  # Fixed CI ports — do not inherit main's 3020/5190 from the developer shell.
  export PORT=3010
  export API_PORT=3010
  export WEB_PORT=5174
  export API_PROXY_TARGET=http://127.0.0.1:3010
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:5174}"
  export VITE_DEV_API_PORT=3010
  unset DOCS_PORT || true
else
  # shellcheck source=scripts/local-dev-ports.sh
  source "$ROOT/scripts/local-dev-ports.sh"
fi

exec npx playwright test "$@"
