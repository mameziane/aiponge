#!/bin/bash
set -e

OUTPUT_FILE="aiponge-source.zip"

rm -f "$OUTPUT_FILE"

echo "Creating source code zip..."
echo "Including: apps/ packages/ deploy/ scripts/ tools/ tests/ docs/ and root config files"
echo "Excluding: node_modules, .git, dist, .expo, logs, uploads"

zip -rq "$OUTPUT_FILE" \
  apps/ \
  packages/ \
  deploy/ \
  scripts/ \
  tools/ \
  tests/ \
  docs/ \
  -x '*/dist/*' \
  -x '*/.expo/*' \
  -x '*/.metro-cache/*' \
  -x '*.log'

zip -q "$OUTPUT_FILE" \
  package.json \
  package-lock.json \
  tsconfig*.json \
  .eslintrc* \
  .prettierrc* \
  .gitignore \
  replit.md \
  .replit \
  replit.nix \
  drizzle.config.ts \
  2>/dev/null || true

SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo ""
echo "Done! Created $OUTPUT_FILE ($SIZE)"
echo "Right-click the file in Replit's file panel and select 'Download' to save it."
