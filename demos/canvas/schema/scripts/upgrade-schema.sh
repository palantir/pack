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

# Mirror the Vite dev-server env file order so this schema upgrade uses the
# same app configuration. Later files override earlier ones:
# defaults -> local overrides -> development defaults -> development overrides.
load_env_file "$APP_DIR/.env"
load_env_file "$APP_DIR/.env.local"
load_env_file "$APP_DIR/.env.development"
load_env_file "$APP_DIR/.env.development.local"

SCHEMA_VERSION="${SCHEMA_VERSION:-}"
PASSTHROUGH_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --version)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "ERROR: --version requires a value."
        exit 1
      fi
      SCHEMA_VERSION="$2"
      shift 2
      ;;
    --version=*)
      SCHEMA_VERSION="${1#*=}"
      shift
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$SCHEMA_VERSION" && ! "$SCHEMA_VERSION" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: --version must be a positive integer."
  exit 1
fi

FOUNDRY_BASE_URL="${FOUNDRY_BASE_URL:-${VITE_FOUNDRY_URL:-https://danube-staging.palantircloud.com}}"
AUTH_TOKEN="${FOUNDRY_TOKEN:-${VITE_DEV_FOUNDRY_TOKEN:-}}"
ONTOLOGY_RID="${ONTOLOGYRID:-${VITE_FOUNDRY_ONTOLOGY_RID:-}}"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "ERROR: VITE_DEV_FOUNDRY_TOKEN or FOUNDRY_TOKEN must be set before upgrading the schema."
  exit 1
fi

if [[ -z "$ONTOLOGY_RID" ]]; then
  echo "ERROR: VITE_FOUNDRY_ONTOLOGY_RID or ONTOLOGYRID must be set before upgrading the schema."
  exit 1
fi

echo "Building type-gen CLI..."
pnpm --filter @palantir/pack.document-schema.type-gen transpileEsm

cd "$SCHEMA_DIR" || exit 1

IR_PATH="build/ir.json"
SCHEMA_IR_ARGS=(
  schema ir
  -i src/schema.mjs
  -o "$IR_PATH"
  --config pack-config.json
)

if [[ -n "$SCHEMA_VERSION" ]]; then
  IR_PATH="build/upgrade-ir-v${SCHEMA_VERSION}.json"
  SCHEMA_IR_ARGS=(
    schema ir
    -i src/schema.mjs
    -o "$IR_PATH"
    --config pack-config.json
    --max-version "$SCHEMA_VERSION"
  )
fi

echo "Building canvas IR..."
pnpm exec type-gen "${SCHEMA_IR_ARGS[@]}"

echo "Upgrading schema on $FOUNDRY_BASE_URL..."
UPDATE_SCHEMA_ARGS=(
  --ir "$IR_PATH"
  --ontology-rid "$ONTOLOGY_RID"
  --auth "$AUTH_TOKEN"
  --base-url "$FOUNDRY_BASE_URL"
)

if [[ -n "$SCHEMA_VERSION" ]]; then
  UPDATE_SCHEMA_ARGS+=(--force-overwrite)
fi

UPDATE_SCHEMA_ARGS+=("${PASSTHROUGH_ARGS[@]}")

pnpm exec type-gen ir update-schema "${UPDATE_SCHEMA_ARGS[@]}"

echo "Schema upgrade submitted."
