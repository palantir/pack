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
echo "🔄 Running versioned codegen..."
cd "$(git rev-parse --show-toplevel)" || exit 1
TYPE_GEN_CLI="packages/document-schema/type-gen/bin/cli-node.js"
node "$TYPE_GEN_CLI" schema gen-types \
    -i "$SCHEMA_DIR/src/schema.mjs" \
    -o "$GENERATED_DIR/src" \
    --min-version 1

# Step 4: Patch index.ts to include versioned exports
echo "📝 Updating index.ts barrel exports..."
cat > "$GENERATED_DIR/src/index.ts" << 'INDEXEOF'
export * from "./models.js";
export * from "./types.js";
export * from "./versions.js";
export * from "./versionedDocRef.js";
export type { ActivityShapeAddEvent_v1, ActivityShapeDeleteEvent_v1, ActivityShapeUpdateEvent_v1, NodeShape_v1, NodeShape_v1Box, NodeShape_v1Circle, PresenceCursorEvent_v1, PresenceSelectionEvent_v1, ShapeBox_v1, ShapeCircle_v1 } from "./types_v1.js";
export type { ActivityShapeAddEvent_v2, ActivityShapeDeleteEvent_v2, ActivityShapeUpdateEvent_v2, NodeShape_v2, NodeShape_v2Box, NodeShape_v2Circle, PresenceCursorEvent_v2, PresenceSelectionEvent_v2, ShapeBox_v2, ShapeCircle_v2 } from "./types_v2.js";
INDEXEOF

# Step 5: Add transpileTypes script to package.json (sorted for mrl compliance)
echo "📦 Patching package.json..."
cd "$GENERATED_DIR" || exit 1
node -e "
const pkg = require('./package.json');
pkg.scripts.transpileTypes = 'tsc --emitDeclarationOnly';
const sorted = Object.keys(pkg.scripts).sort().reduce((acc, k) => { acc[k] = pkg.scripts[k]; return acc; }, {});
pkg.scripts = sorted;
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Show what changed (without staging)
cd "$(git rev-parse --show-toplevel)" || exit 1
echo "📋 SDK changes:"
git status --short "$GENERATED_DIR"

echo "✅ SDK generated successfully!"
