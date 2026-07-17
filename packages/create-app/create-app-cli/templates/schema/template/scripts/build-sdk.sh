#!/bin/bash

set -euo pipefail

# Generates a TypeScript SDK from this schema's IR into a target directory.
#
# Usage: bash scripts/build-sdk.sh [target-dir]
# The default target is a sibling `../sdk` package. Adjust it to point at wherever
# your SDK package lives in your workspace.

SDK_DIR="${1:-../sdk}"
SCHEMA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$SCHEMA_DIR"

echo "🛠  Building schema IR..."
npm run build:ir

echo "🚀 Generating SDK into ${SDK_DIR}..."
npx sdkgen create "$SDK_DIR" \
  --template @palantir/pack.sdkgen.pack-versioned-template \
  --schema "$SCHEMA_DIR/build/ir.json" \
  --config "$SCHEMA_DIR/pack-config.json" \
  --skip-install --non-interactive --overwrite

echo "✅ SDK generated at ${SDK_DIR}"
