#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_SEED="$WEB_DIR/.local/seed"
LOCAL_SEED_MIND="$WEB_DIR/.local/seed-mind"
APP_SEED="$WEB_DIR/app/seed"
APP_SEED_MIND="$WEB_DIR/app/seed-mind"

if [ ! -d "$LOCAL_SEED" ]; then
  echo "❌ .local/seed not found at $LOCAL_SEED"
  exit 1
fi

if [ ! -d "$LOCAL_SEED_MIND" ]; then
  echo "❌ .local/seed-mind not found at $LOCAL_SEED_MIND"
  exit 1
fi

if [ -d "$APP_SEED" ] || [ -d "$APP_SEED_MIND" ]; then
  echo "⚠️  Seed routes already mounted. Run pnpm seed:unmount first."
  exit 1
fi

cp -r "$LOCAL_SEED" "$APP_SEED"
cp -r "$LOCAL_SEED_MIND" "$APP_SEED_MIND"

echo "✅ Seed routes mounted:"
echo "   /seed       → apps/web/app/seed/"
echo "   /seed-mind  → apps/web/app/seed-mind/"
echo ""
echo "   Restart dev server to activate. Run 'pnpm seed:unmount' to remove."
