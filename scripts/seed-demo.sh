#!/usr/bin/env bash
# Thin wrapper: seeds this repo's synthetic demo data into the running local stack (DEV ONLY, see TEST_DATA.md). Usage: scripts/seed-demo.sh [--reset]
# Run `../scripts/seed-all.sh` (workspace root) to seed every product in dependency order.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export NODE_ENV=development
DB=postgresql://postgres:postgres@127.0.0.1:5433/kiorly?schema=public
DATABASE_URL="$DB" npm run db:seed:demo -w api -- "$@"
