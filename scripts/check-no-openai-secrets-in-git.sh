#!/usr/bin/env bash
# Fail if a real OpenAI API key (or similar) is tracked in git — production keys live in AWS Secrets Manager only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "check-no-openai-secrets-in-git: not a git repo" >&2
  exit 1
fi

tracked="$(git ls-files)"
if [[ -z "$tracked" ]]; then
  exit 0
fi

hits="$(echo "$tracked" | xargs rg -n --no-heading \
  'OPENAI_API_KEY\s*=\s*sk-(?!your-key-here)[^\s#]+' \
  'sk-proj-[A-Za-z0-9_-]{20,}' 2>/dev/null || true)"

if [[ -n "$hits" ]]; then
  echo "check-no-openai-secrets-in-git: possible OpenAI API key in tracked files:" >&2
  echo "$hits" >&2
  echo "Remove the key, rotate it in OpenAI, and store production values only in Secrets Manager." >&2
  exit 1
fi

echo "OK  no OpenAI API keys in tracked files"
