#!/usr/bin/env bash
# Root `npm run dev` entry: branch-unique ports + API / web / docs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/local-dev-ports.sh
source "$ROOT/scripts/local-dev-ports.sh"
bash "$ROOT/scripts/free-dev-ports.sh"
echo "Starting local stack on branch ports: API :${API_PORT} · web :${WEB_PORT} · docs :${DOCS_PORT}"
exec concurrently -n api,web,docs -c blue,green,magenta \
  "env PORT=${PORT} API_PORT=${API_PORT} APP_WEB_URL=${APP_WEB_URL} npm run dev -w api" \
  "bash scripts/wait-api-and-dev-web.sh" \
  "env DOCS_PORT=${DOCS_PORT} npm run dev -w docs"
