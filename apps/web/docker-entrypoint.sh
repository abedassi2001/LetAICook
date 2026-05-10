#!/bin/sh
set -e
# Bind-mounted source + named volume for node_modules: re-install when lockfile changes,
# otherwise old volumes miss newly added packages (e.g. html2canvas, mermaid).
LOCK_HASH="missing-lock"
if [ -f package-lock.json ]; then
  LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
fi
STAMP_FILE="/app/.npm-install-stamp"
if [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$LOCK_HASH" ]; then
  echo "letAIcook web: syncing node_modules (npm ci, lockfile stamp)..."
  npm ci
  echo "$LOCK_HASH" > "$STAMP_FILE"
fi
exec "$@"
