#!/usr/bin/env bash
# Classify which deploy surface a push touches so CI can skip unused work.
#
# Usage (from repo root):
#   bash scripts/detect-deploy-scope.sh [base_sha] [head_sha]
#
# Writes GitHub Actions outputs when $GITHUB_OUTPUT is set, and always prints a summary.
# Scope values: skip | web | api | full
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HEAD_SHA="${2:-${GITHUB_SHA:-$(git rev-parse HEAD)}}"
BASE_SHA="${1:-}"

if [[ -z "$BASE_SHA" ]]; then
  if [[ -n "${GITHUB_EVENT_BEFORE:-}" && "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]]; then
    BASE_SHA="$GITHUB_EVENT_BEFORE"
  else
    BASE_SHA="$(git rev-parse "${HEAD_SHA}^" 2>/dev/null || git rev-parse HEAD^ 2>/dev/null || true)"
  fi
fi

if [[ -z "$BASE_SHA" ]] || ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  # First push / shallow history — be safe and do a full deploy.
  SCOPE="full"
  API=true
  WEB=true
  INFRA=true
  echo "detect-deploy-scope: no usable base SHA — defaulting to full"
else
  API=false
  WEB=false
  INFRA=false
  OTHER=false
  HAS_CHANGES=false

  CHANGED_FILES="$(git diff --name-only "$BASE_SHA" "$HEAD_SHA" || true)"
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    HAS_CHANGES=true
    case "$f" in
      apps/api/*|packages/*|platform/*|apps/api/Dockerfile|apps/api/Dockerfile.seed)
        API=true
        ;;
      apps/web/*)
        WEB=true
        ;;
      infra/*|scripts/cicd-*.sh|scripts/cicd-*.mjs|.dockerignore|Dockerfile*)
        INFRA=true
        ;;
      package.json|package-lock.json|apps/*/package.json|packages/*/package.json)
        # Lockfile / workspace manifest changes can affect both images and SPA.
        API=true
        WEB=true
        INFRA=true
        ;;
      .github/workflows/deploy-aws.yml|.github/workflows/ci-test-reusable.yml|.github/actions/*)
        # Deploy/CI plumbing — keep a full gate so workflow changes are proven.
        API=true
        WEB=true
        INFRA=true
        ;;
      Docs/*|.cursor/*|*.md|apps/docs/*)
        # Docs-only: no deploy surface.
        ;;
      *)
        OTHER=true
        ;;
    esac
  done <<EOF
$CHANGED_FILES
EOF

  if [[ "$HAS_CHANGES" != true ]]; then
    SCOPE="skip"
  elif [[ "$API" == true && "$WEB" == true ]] || [[ "$INFRA" == true ]] || [[ "$OTHER" == true ]]; then
    SCOPE="full"
    API=true
    WEB=true
  elif [[ "$API" == true ]]; then
    SCOPE="api"
  elif [[ "$WEB" == true ]]; then
    SCOPE="web"
  else
    SCOPE="skip"
  fi
fi

DEPLOY=false
if [[ "$SCOPE" != "skip" ]]; then
  DEPLOY=true
fi

# CI suite toggles (conservative: still typecheck + unit on both apps when deploying).
RUN_INTEGRATION=false
RUN_E2E=false
RUN_WEB_BUILD=false
if [[ "$SCOPE" == "full" || "$SCOPE" == "api" ]]; then
  RUN_INTEGRATION=true
  RUN_E2E=true
fi
if [[ "$SCOPE" == "full" || "$SCOPE" == "web" ]]; then
  RUN_WEB_BUILD=true
fi
# API-only still builds API for E2E; web build for E2E golden is required when E2E runs.
if [[ "$RUN_E2E" == true ]]; then
  RUN_WEB_BUILD=true
fi

echo "detect-deploy-scope: base=${BASE_SHA:-none} head=${HEAD_SHA}"
echo "detect-deploy-scope: scope=${SCOPE} api=${API} web=${WEB} infra=${INFRA} deploy=${DEPLOY}"
echo "detect-deploy-scope: integration=${RUN_INTEGRATION} e2e=${RUN_E2E} web_build=${RUN_WEB_BUILD}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "scope=${SCOPE}"
    echo "api=${API}"
    echo "web=${WEB}"
    echo "infra=${INFRA}"
    echo "deploy=${DEPLOY}"
    echo "run_integration=${RUN_INTEGRATION}"
    echo "run_e2e=${RUN_E2E}"
    echo "run_web_build=${RUN_WEB_BUILD}"
  } >> "$GITHUB_OUTPUT"
fi
