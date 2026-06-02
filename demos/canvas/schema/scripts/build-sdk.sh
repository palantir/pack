#!/bin/bash

set -euo pipefail

# Configuration
GENERATED_DIR="demos/canvas/sdk"  # Relative to git root
SCHEMA_DIR="demos/canvas/schema"  # Relative to git root
REPO_DIR="$(git rev-parse --show-toplevel)"

cd "$REPO_DIR" || exit 1

if [[ ! -d "$GENERATED_DIR" ]]; then
    echo "❌ ERROR: Target directory '$GENERATED_DIR' does not exist!"
    exit 1
fi

# Step 1: Remove all TRACKED files from src/ so removals show up in git status.
echo "🗑️  Removing tracked files from SDK src/..."
git ls-files "$GENERATED_DIR/src" | while IFS= read -r file; do
    rm -f "$file"
done

# Step 2: Run sdkgen with the versioned template against the IR JSON.
# The hook runs in the template's cwd, not the schema package's cwd, so we
# resolve the schema and config paths to absolute before invoking sdkgen.
IR_PATH="$REPO_DIR/$SCHEMA_DIR/build/ir.json"
CONFIG_PATH="$REPO_DIR/$SCHEMA_DIR/pack-config.json"
echo "🚀 Running sdkgen with pack-versioned-template..."
cd "$SCHEMA_DIR" || exit 1
pnpm exec sdkgen create "../sdk" \
  --template @palantir/pack.sdkgen.pack-versioned-template \
  --schema "$IR_PATH" \
  --config "$CONFIG_PATH" \
  --skip-install --non-interactive --overwrite --verbose

cd "$REPO_DIR" || exit 1
echo "📋 SDK changes:"
git status --short "$GENERATED_DIR"

echo "✅ SDK generated successfully!"
