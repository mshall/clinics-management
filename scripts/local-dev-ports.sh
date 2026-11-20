#!/usr/bin/env bash
# Resolve unique local ports for this checkout so `main` can run beside other branches.
# Sourced by npm run dev / free-dev-ports / wait scripts.
#
#   main  → API 3020 · web 5190 · docs 5191
#   other → API 3010 · web 5174 · docs 5175  (CI / Playwright defaults)
#
# Overrides (optional): KIORLY_API_PORT, KIORLY_WEB_PORT, KIORLY_DOCS_PORT, KIORLY_DEV_BRANCH.
# Ambient PORT/API_PORT from the shell are ignored unless KIORLY_USE_ENV_PORTS=1.
set -euo pipefail

# Works when sourced from bash or zsh (`npm` scripts always use bash -c).
_ports_src="${BASH_SOURCE[0]:-}"
if [[ -z "$_ports_src" ]]; then _ports_src="${(%):-%x}"; fi 2>/dev/null || true
if [[ -z "$_ports_src" || "$_ports_src" == "-zsh" || "$_ports_src" == "zsh" || "$_ports_src" == "-bash" ]]; then
  _ports_src="$0"
fi
ROOT="$(cd "$(dirname "$_ports_src")/.." && pwd)"
unset _ports_src

_branch="${KIORLY_DEV_BRANCH:-}"
if [[ -z "$_branch" ]] && command -v git >/dev/null 2>&1; then
  _branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
fi

case "$_branch" in
  main)
    _default_api=3020
    _default_web=5190
    _default_docs=5191
    ;;
  *)
    _default_api=3010
    _default_web=5174
    _default_docs=5175
    ;;
esac

if [[ "${KIORLY_USE_ENV_PORTS:-}" == "1" ]]; then
  export PORT="${PORT:-${KIORLY_API_PORT:-$_default_api}}"
  export WEB_PORT="${WEB_PORT:-${KIORLY_WEB_PORT:-$_default_web}}"
  export DOCS_PORT="${DOCS_PORT:-${KIORLY_DOCS_PORT:-$_default_docs}}"
else
  export PORT="${KIORLY_API_PORT:-$_default_api}"
  export WEB_PORT="${KIORLY_WEB_PORT:-$_default_web}"
  export DOCS_PORT="${KIORLY_DOCS_PORT:-$_default_docs}"
fi

export API_PORT="${API_PORT:-$PORT}"
# When not using ambient env ports, force API_PORT to match branch PORT.
if [[ "${KIORLY_USE_ENV_PORTS:-}" != "1" ]]; then
  export API_PORT="$PORT"
fi

export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"
export APP_WEB_URL="${APP_WEB_URL:-http://localhost:${WEB_PORT}}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
export VITE_DEV_API_PORT="${VITE_DEV_API_PORT:-$API_PORT}"

unset _branch _default_api _default_web _default_docs
