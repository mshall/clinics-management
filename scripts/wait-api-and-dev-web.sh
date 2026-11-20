#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/local-dev-ports.sh
source "$ROOT/scripts/local-dev-ports.sh"

bash "$ROOT/scripts/wait-api-ready.sh" 120
echo "Starting clinic app at http://localhost:${WEB_PORT}/login (docs portal: http://localhost:${DOCS_PORT})"
exec env PORT="$PORT" API_PORT="$API_PORT" WEB_PORT="$WEB_PORT" API_PROXY_TARGET="$API_PROXY_TARGET" \
  VITE_DEV_API_PORT="$VITE_DEV_API_PORT" APP_WEB_URL="$APP_WEB_URL" \
  npm run dev -w web
