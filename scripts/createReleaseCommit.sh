#!/usr/bin/env bash
set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd "${SCRIPT_DIR}/../"

# Optional base selector: `main` or `release`. The tool enforces the branching model
# (main = minor/major, release/* = patch) and normally auto-detects the base, but when
# HEAD sits on a commit shared by main and a release branch (e.g. the first patch on a
# freshly-cut release branch) detection is ambiguous and must be told explicitly.
case "${1:-}" in
  main) export VERSION_COMMIT_BRANCH_TYPE="main" ;;
  release) export VERSION_COMMIT_BRANCH_TYPE="release branch" ;;
  "") : ;; # no arg: honor any pre-set VERSION_COMMIT_BRANCH_TYPE, else auto-detect
  *)
    echo "Usage: $0 [main|release]"
    exit 1
    ;;
esac

# Build the release tool
pnpm exec turbo transpile --filter "./packages/monorepo/release"

# Run version bump and create commit on current branch with version digest.
node ./packages/monorepo/release/build/esm/index.js \
  --mode version-commit

# Run build and test to regenerate files with new versions (snapshots, demo files, etc.)
pnpm build
pnpm test -- --update

# Add empty changeset to pass CI checks
pnpm exec changeset add --empty

# Amend the release commit with the regenerated files and empty changeset
git add -A
git commit --amend --no-edit
