#!/bin/sh
set -e
if [ ! -d node_modules/next ]; then
  echo "letAIcook web: installing npm dependencies (first run or empty volume)..."
  npm ci
fi
exec "$@"
