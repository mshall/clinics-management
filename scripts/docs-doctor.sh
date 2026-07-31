#!/usr/bin/env bash
# Quick checks before starting the documentation portal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Kiorly documentation portal — doctor"
echo ""

if [ ! -d "node_modules" ]; then
  echo "✗ node_modules missing. Run: npm install"
  exit 1
fi

if [ ! -f "apps/docs/content/piggymetrics/README.md" ]; then
  echo "⚠ PiggyMetrics content missing. Run: npm run docs:sync"
else
  echo "✓ PiggyMetrics content present"
fi

if lsof -ti ":5175" >/dev/null 2>&1; then
  echo "⚠ Port 5175 is already in use (docs portal may already be running)"
  lsof -i ":5175" 2>/dev/null | head -3 || true
else
  echo "✓ Port 5175 is free"
fi

echo ""
echo "Start the portal:"
echo "  npm run docs:dev     → http://localhost:5175"
echo ""
echo "Or start everything (API + web + docs):"
echo "  npm run dev"
echo ""
echo "Note: Swagger API docs live at http://localhost:3000/docs (not the markdown portal)."
