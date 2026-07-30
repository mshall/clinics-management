#!/usr/bin/env bash
# Sync PiggyMetrics upstream documentation (master branch) into apps/docs/content/piggymetrics.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/apps/docs/content/piggymetrics"
UPSTREAM="https://github.com/sqshq/PiggyMetrics"
RAW_README="$UPSTREAM/raw/master/README.md"
API_COMMITS="$UPSTREAM/commits/master"

mkdir -p "$DEST"

echo "Fetching PiggyMetrics README from master…"
curl -fsSL "$RAW_README" -o "$DEST/README.md"

SHA=""
DATE=""
if command -v node >/dev/null 2>&1; then
  META="$(curl -fsSL "https://api.github.com/repos/sqshq/PiggyMetrics/commits/master")"
  SHA="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.sha||'')" "$META")"
  DATE="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.commit?.committer?.date||'')" "$META")"
fi

cat > "$DEST/SYNC.json" <<EOF
{
  "source": "sqshq/PiggyMetrics",
  "branch": "master",
  "syncedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "commitSha": "${SHA:-unknown}",
  "commitDate": "${DATE:-unknown}",
  "readmeUrl": "$RAW_README"
}
EOF

echo "Synced to $DEST (commit ${SHA:-unknown})"
