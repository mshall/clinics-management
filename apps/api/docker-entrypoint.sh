#!/bin/sh
set -eu
cd "$(dirname "$0")"
PORT="${PORT:-3000}"
export PORT
# Bind :3000 immediately (CommonJS-free sidecar) before any async boot work.
node health-sidecar.mjs &
SIDECAR_PID=$!
export HEALTH_SIDECAR_PID="$SIDECAR_PID"
trap 'kill "$SIDECAR_PID" 2>/dev/null || true' EXIT
exec node docker-boot.mjs
