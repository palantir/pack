# @palantir/pack.sdkgen.pack-versioned-template

## 0.4.0

### Minor Changes

- 98803f7: Add version-safe update methods to DocumentRef

### Patch Changes

- Updated dependencies [1cc9a09]
- Updated dependencies [98803f7]
  - @palantir/pack.document-schema.type-gen@0.13.0
  - @palantir/pack.document-schema.model-types@0.12.0

## 0.3.0

### Minor Changes

- e40ca65: Pipe minimum supported schema version from the SDK's pack-config so the IR is the single source of truth. `ir asset` now also emits a sibling `*-schema-compatibility-range.json` file required by the backend to compute operational versions for first-party apps.

  - `schema ir` now requires `--config <pack-config.json>`. Its optional `minSupportedVersion` field declares the oldest schema version this SDK supports; omit the field to track latest only.
  - `ir gen-types` no longer accepts `--min-version`; the value is read from the IR payload.
  - `pack-versioned-template` no longer prompts for `minVersion`; declare `minSupportedVersion` in your pack-config instead.

- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [4b27697]
- Updated dependencies [e40ca65]
- Updated dependencies [8ff3c6a]
- Updated dependencies [f92557e]
- Updated dependencies [e540eba]
  - @palantir/pack.document-schema.type-gen@0.12.0
  - @palantir/pack.document-schema.model-types@0.11.0

## 0.2.0

### Patch Changes

- @palantir/pack.document-schema.model-types@0.10.0
- @palantir/pack.document-schema.type-gen@0.11.0

## 0.1.0

### Minor Changes

- ee3e008: Add Versioned SDK Template

### Patch Changes

- Updated dependencies [2153788]
- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.type-gen@0.10.0
  - @palantir/pack.document-schema.model-types@0.9.0
