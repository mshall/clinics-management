#!/usr/bin/env bash
# Exit 0 when local API is up; otherwise print fix steps (for agents/CI smoke).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/local-dev-ports.sh
source "$ROOT/scripts/local-dev-ports.sh"

if bash "$ROOT/scripts/wait-api-ready.sh" 3 2>/dev/null; then
  exit 0
fi

echo "Local API is not reachable on port ${API_PORT}." >&2
echo "Fix: from ${ROOT} run: npm run db:ensure && npm run dev" >&2
echo "Wait until you see: API listening on http://127.0.0.1:${API_PORT}/api/v1" >&2
exit 1
