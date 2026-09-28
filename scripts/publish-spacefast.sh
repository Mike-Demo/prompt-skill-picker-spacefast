#!/usr/bin/env bash
# Publishes the Skill Finder SpaceFast migration to a preview space.
#
# Works around a SpaceFast CLI bug (sf 0.4.1): when the publish directory
# contains docs/api/index.html, the CLI treats docs/api as the publish root
# and uploads only that page. The docs page is therefore published at the
# internal path /api-docs/index.html and served at the public /docs/api URL
# via _redirects rewrites. Remove this workaround if the CLI is fixed.
#
# Usage: ./scripts/publish-spacefast.sh [space-slug] [message]
set -euo pipefail

SPACE="${1:-skill-finder-preview}"
MESSAGE="${2:-preview publish}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)/sf-publish"

cd "$ROOT"
npm run build

rm -rf "$OUT"
mkdir -p "$OUT"
cp -a dist/client/. "$OUT/"
cp -a functions sf.jsonc "$OUT/"

# CLI drill-down workaround: relocate the docs API page.
mkdir -p "$OUT/api-docs"
cp dist/client/docs/api/index.html "$OUT/api-docs/index.html"
rm -rf "$OUT/docs"
printf '/docs/api /api-docs/index.html 200\n/docs/api/ /api-docs/index.html 200\n' >> "$OUT/_redirects"

sf publish "$OUT" --space "$SPACE" -m "$MESSAGE" -y --wait
