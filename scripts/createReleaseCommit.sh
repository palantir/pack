#!/usr/bin/env bash
set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd "${SCRIPT_DIR}/../"

# Build the release tool
pnpm exec turbo transpile --filter "./packages/monorepo/release"

# Run version bump and create commit on current branch with version digest
node ./packages/monorepo/release/build/esm/index.js \
  --mode version-commit
