#!/usr/bin/env bash
# Sync local main with GitHub origin (fetch + fast-forward pull; optional push).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE="${GIT_REMOTE:-origin}"
BRANCH="${GIT_BRANCH:-main}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $ROOT" >&2
  exit 1
fi

echo "GitHub sync — remote=$REMOTE branch=$BRANCH"
git fetch "$REMOTE" "$BRANCH"

counts="$(git rev-list --left-right --count "HEAD...${REMOTE}/${BRANCH}" 2>/dev/null | tr '\t' ' ' || echo "0 0")"
read -r ahead behind _ <<<"$counts"
ahead="${ahead:-0}"
behind="${behind:-0}"

echo "  Local vs ${REMOTE}/${BRANCH}: ahead $ahead, behind $behind"

if [[ "${behind:-0}" -gt 0 ]]; then
  echo "Pulling fast-forward from ${REMOTE}/${BRANCH}…"
  git pull --ff-only "$REMOTE" "$BRANCH"
fi

if [[ "${SYNC_GITHUB_PUSH:-}" == "1" || "${SYNC_GITHUB_PUSH:-}" == "true" ]]; then
  if [[ "${ahead:-0}" -gt 0 ]]; then
    echo "Pushing to ${REMOTE}/${BRANCH}…"
    git push "$REMOTE" "HEAD:${BRANCH}"
  else
    echo "Nothing to push."
  fi
fi

git status -sb
echo "Latest commit: $(git log -1 --oneline)"
echo "Remote URL:    $(git remote get-url "$REMOTE" 2>/dev/null || echo n/a)"
