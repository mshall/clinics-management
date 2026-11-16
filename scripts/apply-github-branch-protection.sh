#!/usr/bin/env bash
# Apply main-branch protection: require the "CI test" check before merge.
# Requires: gh CLI, repo admin. Safe to re-run (updates settings).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  exit 1
fi

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Configuring branch protection on ${repo} (branch: main)…"

# Job name in .github/workflows/ci-test.yml — must match the required status check in GitHub.
REQUIRED_CHECK="CI test"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${repo}/branches/main/protection" \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["${REQUIRED_CHECK}"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false
}
EOF

echo "Done. main requires status check: ${REQUIRED_CHECK}"
echo "Also active: .github/workflows/main-sensitive-paths.yml (direct push guard for fiscal/billing/revenue)."