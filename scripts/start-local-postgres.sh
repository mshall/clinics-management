#!/usr/bin/env bash
# Start local Postgres when Docker is unavailable (e.g. bad CPU type on Intel Docker app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/Users/postgres/bin:/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/opt/postgresql/bin:/usr/local/opt/postgresql@16/bin:/usr/local/bin:$PATH"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker compose up -d postgres 2>/dev/null; then
    echo "Started postgres via docker compose."
    exit 0
  fi
  echo "docker compose failed (try arm64 Docker Desktop); falling back to native Postgres …" >&2
fi

PG_CTL="${PG_CTL:-}"
if [[ -z "$PG_CTL" ]]; then
  for c in /Users/postgres/bin/pg_ctl /opt/homebrew/opt/postgresql@16/bin/pg_ctl; do
    if [[ -x "$c" ]]; then PG_CTL="$c"; break; fi
  done
fi

PGDATA="${PGDATA:-/Users/postgres/data}"

if [[ -n "$PG_CTL" && -d "$PGDATA" ]]; then
  if sudo -n -u postgres "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "Postgres already running ($PGDATA)."
    exit 0
  fi
  if sudo -n -u postgres "$PG_CTL" -D "$PGDATA" start -w -t 30 2>/dev/null; then
    echo "Started Postgres via $PG_CTL."
    exit 0
  fi
  echo "Native Postgres at $PGDATA needs admin: run manually:" >&2
  echo "  sudo -u postgres $PG_CTL -D $PGDATA start" >&2
  exit 1
fi

echo "No Postgres found. Install Docker (arm64) or Postgres.app, or set PG_CTL/PGDATA." >&2
exit 1
