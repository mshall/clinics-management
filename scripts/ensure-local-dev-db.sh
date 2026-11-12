#!/usr/bin/env bash
# Used before npm run dev and integration smoke: Postgres up, migrations, seed if empty.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/start-local-postgres.sh"

export PATH="/Users/postgres/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

npm run prisma:generate -w api >/dev/null

npm run db:deploy -w api

# Seed once when the database has no tenant (fresh .pgdata)
if command -v psql >/dev/null 2>&1; then
  _tenants="$(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U postgres -d postgres -tAc 'SELECT COUNT(*) FROM "Tenant"' 2>/dev/null || echo "0")"
  if [[ "${_tenants// /}" == "0" ]]; then
    echo "Empty database — running seed (npm run db:setup -w api) …"
    PRISMA_SEED_ENSURE_DEMO_PASSWORDS=true npm run db:seed -w api
  fi
fi
