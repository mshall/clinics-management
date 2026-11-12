#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Users/postgres/bin:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  (cd "$ROOT" && docker compose down 2>/dev/null) || true
fi

PG_CTL=""
for c in /Users/postgres/bin/pg_ctl /opt/homebrew/opt/postgresql@16/bin/pg_ctl; do
  [[ -x "$c" ]] && PG_CTL="$c" && break
done

if [[ -n "$PG_CTL" && -d "$ROOT/.pgdata" ]]; then
  "$PG_CTL" -D "$ROOT/.pgdata" stop -m fast 2>/dev/null || true
  echo "Stopped workspace Postgres (.pgdata) if it was running."
fi
