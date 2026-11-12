#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/Users/postgres/bin:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if [[ ! -f apps/api/.env ]]; then
  cp apps/api/.env.example apps/api/.env
  echo "Created apps/api/.env from .env.example — edit DATABASE_URL if needed."
fi

bash "$ROOT/scripts/ensure-local-dev-db.sh"

echo "Starting API + web + docs (Ctrl+C to stop)..."
exec npm run dev
