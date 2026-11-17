#!/usr/bin/env bash
# npm ci with retries — mirrors GitHub Actions install; recovers from flaky registry/cache on ubuntu-latest.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

max_attempts="${NPM_CI_MAX_ATTEMPTS:-3}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  if NPM_CONFIG_LOGLEVEL=error npm ci --no-audit --no-fund "$@"; then
    exit 0
  fi
  echo "npm-ci-workflow: attempt ${attempt}/${max_attempts} failed." >&2
  if [ "$attempt" -lt "$max_attempts" ]; then
    npm cache clean --force
    sleep "$((attempt * 5))"
  fi
  attempt=$((attempt + 1))
done

echo "npm-ci-workflow: all attempts failed." >&2
exit 1