#!/usr/bin/env bash
# Apply main-branch protection: PR required, CI must pass, applies to admins too.
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

# Reusable workflow: caller job name + called job name (both display "CI test").
# Verify on an open PR: Checks tab → name must match exactly below.
REQUIRED_CHECK="CI test / CI test"

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
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false
}
EOF

echo "Done. main requires:"
echo "  - pull request before merge (0 approvals OK for solo maintainers)"
echo "  - status check: ${REQUIRED_CHECK}"
echo "  - enforce_admins: true (use GitHub bypass / temporary disable only when truly needed)"