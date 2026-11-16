#!/usr/bin/env bash
# Point this repo at tracked hooks in .githooks/ (pre-push → npm run ci:test).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x .githooks/pre-push
git config core.hooksPath .githooks
echo "Git hooks installed: core.hooksPath=.githooks (pre-push runs ci:test)."
echo "Emergency skip: SKIP_CI_TEST=1 git push"