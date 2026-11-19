#!/usr/bin/env bash
# Echo the AWS CLI profile for the current git / CI branch.
# - kiorex → aws-kiorex-profile (second AWS account)
# - main / other → empty (default credential chain = existing Kiorly account)
# Override: AWS_PROFILE_OVERRIDE=my-profile
set -euo pipefail
if [[ -n "${AWS_PROFILE_OVERRIDE:-}" ]]; then
  printf '%s' "$AWS_PROFILE_OVERRIDE"
  exit 0
fi
branch="${GITHUB_REF_NAME:-}"
if [[ -z "$branch" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
case "$branch" in
  kiorex|kiorex/*)
    printf '%s' "aws-kiorex-profile"
    ;;
  *)
    printf '%s' ""
    ;;
esac
