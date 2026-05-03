#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
  echo "SKIP_DOCKER=1 — not starting containers (using local Postgres from apps/api/.env)."
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found in PATH. Install Docker Desktop, or run with SKIP_DOCKER=1 if Postgres is already local." >&2
    exit 1
  fi

  if docker compose version >/dev/null 2>&1; then
    echo "Starting services with docker compose..."
    docker compose up -d
  else
    echo "docker compose plugin not found; starting Postgres with docker run..."
    docker rm -f cms-postgres >/dev/null 2>&1 || true
    docker run -d --name cms-postgres -p 5432:5432 \
      -e POSTGRES_USER=cms -e POSTGRES_PASSWORD=cms -e POSTGRES_DB=cms \
      postgres:16-alpine
  fi
fi

echo "Waiting for Postgres on localhost:5432..."
for i in $(seq 1 60); do
  if command -v pg_isready >/dev/null 2>&1; then
    if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
      pg_isready -h 127.0.0.1 -p 5432 -q && break
    else
      PGPASSWORD=cms pg_isready -h 127.0.0.1 -p 5432 -U cms -d cms -q && break
    fi
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 5432 && break
  else
    bash -c "echo >/dev/tcp/127.0.0.1/5432" >/dev/null 2>&1 && break || true
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi
done

if [[ ! -f apps/api/.env ]]; then
  cp apps/api/.env.example apps/api/.env
  echo "Created apps/api/.env from .env.example — edit DATABASE_URL if needed."
fi

echo "Running migrations + seed..."
npm run db:setup -w api

echo "Starting API + web (Ctrl+C to stop)..."
exec npm run dev
