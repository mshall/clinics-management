#!/usr/bin/env bash
# SC-06 — dependency scanning for production deps (critical/high).
# Exit non-zero on high+ findings so launch/CI gates can require a clean audit.
set -euo pipefail
cd "$(dirname "$0")/.."
npm audit --omit=dev --audit-level=high
