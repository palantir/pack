# @palantir/pack.create-app

## 0.25.0

### Minor Changes

- f455d89: Add `--force-overwrite` to `ir asset`. When set, the generated document type asset carries
  `forceOverwrite: true`, telling the platform to skip incremental schema validation when it
  processes the asset — the asset-track counterpart to `ir update-schema --force-overwrite`.
  The generated workspace app's root `build:asset` script now forwards extra args to the schema
  package so the flag reaches the underlying `ir asset` invocation.
- e2588b6: Fix generated index.html to remove accidental VITE\_\* tag reference
- 51295ea: Drop documentTypeName from the PageEnv
- b7524e6: Include basic oauth redirect setup in generated app

### Patch Changes

- @palantir/pack.codegen.core@0.25.0

## 0.24.0

### Minor Changes

- 58dc044: Add `@palantir/pack.create-app`, an `npx`-runnable CLI that scaffolds PACK starter
  projects from built-in templates (`schema` and `workspace`). Supports first-party packs
  (`--first-party`, `--owning-application-id`) that build a `com.palantir.pack.*` document
  type asset, and third-party packs that deploy the document type to a Foundry stack.

### Patch Changes

- Updated dependencies [194de87]
  - @palantir/pack.codegen.core@0.24.0
