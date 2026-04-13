#!/bin/bash

set -euo pipefail

# Configuration
GENERATED_DIR="demos/canvas/sdk"  # Relative to git root
SCHEMA_DIR="demos/canvas/schema"  # Relative to git root
REPO_DIR="$(git rev-parse --show-toplevel)"

# Change to the repository root
cd "$REPO_DIR" || exit 1

# Safety check: Verify target directory exists
if [[ ! -d "$GENERATED_DIR" ]]; then
    echo "❌ ERROR: Target directory '$GENERATED_DIR' does not exist!"
    exit 1
fi

# Step 1: Remove all TRACKED files from the directory (preserves gitignored files like node_modules)
# This allows git to notice any removals (ie files that are not regenerated)
# Preserve turbo.jsonc since it contains package-specific configuration
echo "🗑️  Removing tracked files from SDK directory..."
git ls-files "$GENERATED_DIR/src" | while IFS= read -r file; do
    rm -f "$file"
done

# Step 2: Run the generator with overwrite
echo "🚀 Running sdkgen..."
cd "$SCHEMA_DIR" || exit 1
pnpm exec sdkgen create "../sdk" --template @palantir/pack.sdkgen.pack-template --schema build/migrations --config pack-config.json --skip-install --non-interactive --overwrite --verbose

# Step 3: Run versioned codegen on the programmatic schema
# This generates per-version types, versionedDocRef, versions, and overwrites
# index.ts with a proper barrel export including all generated modules.
echo "🔄 Running versioned codegen..."
cd "$(git rev-parse --show-toplevel)" || exit 1
TYPE_GEN_CLI="packages/document-schema/type-gen/bin/cli-node.js"
node "$TYPE_GEN_CLI" schema gen-types \
    -i "$SCHEMA_DIR/src/schema.mjs" \
    -o "$GENERATED_DIR/src" \
    --min-version 1

# Step 4: Ensure transpileTypes script exists in package.json (sorted for mrl compliance)
echo "📦 Ensuring transpileTypes script..."
cd "$GENERATED_DIR" || exit 1
node -e "
const pkg = require('./package.json');
if (!pkg.scripts.transpileTypes) {
  pkg.scripts.transpileTypes = 'tsc --emitDeclarationOnly';
  const sorted = Object.keys(pkg.scripts).sort().reduce((acc, k) => { acc[k] = pkg.scripts[k]; return acc; }, {});
  pkg.scripts = sorted;
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}
"

# Show what changed (without staging)
cd "$(git rev-parse --show-toplevel)" || exit 1
echo "📋 SDK changes:"
git status --short "$GENERATED_DIR"

echo "✅ SDK generated successfully!"
