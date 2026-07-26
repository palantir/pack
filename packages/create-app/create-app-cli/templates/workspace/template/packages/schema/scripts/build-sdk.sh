#!/bin/bash

set -euo pipefail

# Generates the typed SDK for the sibling `../sdk` package from this schema's IR.

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
