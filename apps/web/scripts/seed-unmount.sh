#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SEED="$WEB_DIR/app/seed"
APP_SEED_MIND="$WEB_DIR/app/seed-mind"

removed=0

if [ -d "$APP_SEED" ]; then
  rm -rf "$APP_SEED"
  echo "🗑  Removed apps/web/app/seed/"
  removed=1
fi

if [ -d "$APP_SEED_MIND" ]; then
  rm -rf "$APP_SEED_MIND"
  echo "🗑  Removed apps/web/app/seed-mind/"
  removed=1
fi

if [ "$removed" -eq 0 ]; then
  echo "ℹ️  No seed routes mounted. Nothing to remove."
else
  echo ""
  echo "✅ Seed routes unmounted. Restart dev server to take effect."
  echo "   Seed data preserved in apps/web/.local/seed/ and apps/web/.local/seed-mind/"
fi
