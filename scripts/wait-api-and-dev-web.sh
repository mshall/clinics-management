#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/wait-api-ready.sh" 120
echo "Starting clinic app at http://localhost:5173/login (docs portal: http://localhost:5175)"
exec npm run dev -w web