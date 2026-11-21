#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/wait-api-ready.sh" 120
echo "Starting clinic app at http://localhost:5174/login (docs portal: http://localhost:${DOCS_PORT:-5176})"
exec npm run dev -w web