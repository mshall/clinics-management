#!/usr/bin/env bash
# Start Postgres for local dev: existing listener → Docker → repo .pgdata → system install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/Users/postgres/bin:/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/opt/postgresql/bin:/usr/local/opt/postgresql@16/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

PG_PORT="${PGPORT:-5432}"
PG_HOST="${PGHOST:-127.0.0.1}"

pg_ready() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h "$PG_HOST" -p "$PG_PORT" -q
    return $?
  fi
  bash -c "echo >/dev/tcp/$PG_HOST/$PG_PORT" >/dev/null 2>&1
}

if pg_ready; then
  echo "Postgres already accepting connections on $PG_HOST:$PG_PORT"
  exit 0
fi

# --- Docker (only when the daemon is usable) ---
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker compose up -d postgres 2>/dev/null; then
    for _ in $(seq 1 30); do
      if pg_ready; then
        echo "Started postgres via docker compose."
        exit 0
      fi
      sleep 1
    done
  fi
  echo "docker compose postgres did not become ready; trying workspace .pgdata …" >&2
fi

PG_CTL=""
for c in /Users/postgres/bin/pg_ctl /opt/homebrew/opt/postgresql@16/bin/pg_ctl /opt/homebrew/opt/postgresql@17/bin/pg_ctl; do
  if [[ -x "$c" ]]; then PG_CTL="$c"; break; fi
done

if [[ -z "$PG_CTL" ]]; then
  echo "No pg_ctl found. Install Postgres or fix Docker Desktop (arm64)." >&2
  exit 1
fi

# Parse superuser password from apps/api/.env when present (matches prisma DATABASE_URL)
DB_PASSWORD="${KIORLY_LOCAL_PG_PASSWORD:-CareemTiger}"
if [[ -f "$ROOT/apps/api/.env" ]]; then
  _url="$(grep -E '^DATABASE_URL=' "$ROOT/apps/api/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  if [[ "$_url" =~ ://([^:]+):([^@]+)@ ]]; then
    DB_PASSWORD="${BASH_REMATCH[2]}"
  fi
fi

start_workspace_pgdata() {
  local PGDATA="$ROOT/.pgdata"
  mkdir -p "$PGDATA"

  if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
    echo "Initializing workspace Postgres at $PGDATA …"
    initdb -D "$PGDATA" -U postgres --encoding=UTF8 --locale=C --auth-local=trust --auth-host=trust
    {
      echo ""
      echo "# kiorly workspace dev"
      echo "local   all             all                                     trust"
      echo "host    all             all             127.0.0.1/32            trust"
      echo "host    all             all             ::1/128                 trust"
    } >>"$PGDATA/pg_hba.conf"
  fi

  if ! "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_CTL" -D "$PGDATA" -l "$PGDATA/server.log" -o "-p $PG_PORT" start -w -t 60
  fi

  if command -v psql >/dev/null 2>&1; then
    psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER USER postgres WITH PASSWORD '$DB_PASSWORD';" >/dev/null 2>&1 || true
  fi

  if pg_ready; then
    echo "Started workspace Postgres (.pgdata) on $PG_HOST:$PG_PORT"
    exit 0
  fi
  echo "Workspace Postgres failed to start; see $PGDATA/server.log" >&2
  return 1
}

start_workspace_pgdata || true

# --- System install (/Users/postgres/data) with passwordless sudo ---
SYSTEM_PGDATA="${PGDATA:-/Users/postgres/data}"
if [[ -d "$SYSTEM_PGDATA" ]]; then
  if sudo -n -u postgres "$PG_CTL" -D "$SYSTEM_PGDATA" status >/dev/null 2>&1; then
    echo "Postgres already running ($SYSTEM_PGDATA)."
    exit 0
  fi
  if sudo -n -u postgres "$PG_CTL" -D "$SYSTEM_PGDATA" start -w -t 30 2>/dev/null; then
    echo "Started system Postgres at $SYSTEM_PGDATA"
    exit 0
  fi
  echo "System Postgres at $SYSTEM_PGDATA needs: sudo -u postgres $PG_CTL -D $SYSTEM_PGDATA start" >&2
fi

if ! pg_ready; then
  echo "Could not start Postgres on $PG_HOST:$PG_PORT" >&2
  exit 1
fi
