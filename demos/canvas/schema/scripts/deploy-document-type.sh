#!/bin/bash

set -euo pipefail

SCHEMA_DIR="demos/canvas/schema" # Relative to git root
APP_DIR="demos/canvas/app" # Relative to git root
REPO_DIR="$(git rev-parse --show-toplevel)"

cd "$REPO_DIR" || exit 1

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    echo "Loading env from $env_file"
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

# Mirror the Vite dev-server env file order so this schema deploy uses the
# same app configuration. Later files override earlier ones:
# defaults -> local overrides -> development defaults -> development overrides.
load_env_file "$APP_DIR/.env"
load_env_file "$APP_DIR/.env.local"
load_env_file "$APP_DIR/.env.development"
load_env_file "$APP_DIR/.env.development.local"

FOUNDRY_BASE_URL="${VITE_FOUNDRY_URL:-}"
AUTH_TOKEN="${VITE_DEV_FOUNDRY_TOKEN:-}"
PARENT_FOLDER_RID="${VITE_PACK_PARENT_FOLDER_RID:-}"
FILE_SYSTEM_TYPE="${VITE_PACK_FILE_SYSTEM_TYPE:-ARTIFACTS}"

if [[ -z "$FOUNDRY_BASE_URL" ]]; then
  echo "ERROR: VITE_FOUNDRY_URL must be set in the environment or app env files."
  exit 1
fi

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "ERROR: VITE_DEV_FOUNDRY_TOKEN must be set before deploying."
  exit 1
fi

if [[ -z "$PARENT_FOLDER_RID" ]]; then
  echo "ERROR: VITE_PACK_PARENT_FOLDER_RID must be set for type-gen ir deploy."
  exit 1
fi

if [[ "$FILE_SYSTEM_TYPE" != "ARTIFACTS" && "$FILE_SYSTEM_TYPE" != "COMPASS" ]]; then
  echo "ERROR: VITE_PACK_FILE_SYSTEM_TYPE must be ARTIFACTS or COMPASS."
  exit 1
fi

echo "Building canvas IR..."
pnpm --filter @demo/canvas.schema build:ir

echo "Building type-gen CLI..."
pnpm --filter @palantir/pack.document-schema.type-gen transpileEsm

echo "Deploying document type to $FOUNDRY_BASE_URL..."
cd "$SCHEMA_DIR" || exit 1
pnpm exec type-gen ir deploy \
  --ir build/ir.json \
  --base-url "$FOUNDRY_BASE_URL" \
  --auth "$AUTH_TOKEN" \
  --parent-folder "$PARENT_FOLDER_RID" \
  --file-system-type "$FILE_SYSTEM_TYPE"

echo "Document type deploy submitted. Verify your document type has been created in your designated project parent folder."
