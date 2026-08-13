# @palantir/pack.create-app

## 0.24.0

### Minor Changes

- 58dc044: Add `@palantir/pack.create-app`, an `npx`-runnable CLI that scaffolds PACK starter
  projects from built-in templates (`schema` and `workspace`). Supports first-party packs
  (`--first-party`, `--owning-application-id`) that build a `com.palantir.pack.*` document
  type asset, and third-party packs that deploy the document type to a Foundry stack.

### Patch Changes

- Updated dependencies [194de87]
  - @palantir/pack.codegen.core@0.24.0
