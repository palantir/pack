# @palantir/pack.sdkgen.pack-template

## 0.18.0

### Patch Changes

- Updated dependencies [931c9a4]
  - @palantir/pack.document-schema.type-gen@0.20.0

## 0.17.0

### Patch Changes

- Updated dependencies [9e9b29d]
  - @palantir/pack.document-schema.type-gen@0.19.0

## 0.16.0

### Patch Changes

- Updated dependencies [4fef953]
  - @palantir/pack.document-schema.type-gen@0.18.0

## 0.15.0

### Patch Changes

- Updated dependencies [6e3062b]
- Updated dependencies [11c75ce]
  - @palantir/pack.document-schema.model-types@0.15.0
  - @palantir/pack.document-schema.type-gen@0.17.0

## 0.14.0

### Patch Changes

- Updated dependencies [ba9fa6a]
  - @palantir/pack.document-schema.type-gen@0.16.0

## 0.13.0

### Minor Changes

- a1580ba: Deduplicate schema version / lense logic

### Patch Changes

- Updated dependencies [a1580ba]
- Updated dependencies [a8432cf]
  - @palantir/pack.document-schema.model-types@0.14.0
  - @palantir/pack.document-schema.type-gen@0.15.0

## 0.12.0

### Minor Changes

- a98cdbc: Add `max-version` parameter to schema IR generation to cap generation at a given version
- d86ec14: Extend versioning to activity and presence events

### Patch Changes

- Updated dependencies [a98cdbc]
- Updated dependencies [0d90a68]
- Updated dependencies [d86ec14]
- Updated dependencies [aac4760]
- Updated dependencies [2026c0a]
- Updated dependencies [c872dde]
  - @palantir/pack.document-schema.model-types@0.13.0
  - @palantir/pack.document-schema.type-gen@0.14.0

## 0.11.0

### Minor Changes

- 98803f7: Add version-safe update methods to DocumentRef

### Patch Changes

- Updated dependencies [1cc9a09]
- Updated dependencies [98803f7]
  - @palantir/pack.document-schema.type-gen@0.13.0
  - @palantir/pack.document-schema.model-types@0.12.0

## 0.10.0

### Minor Changes

- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [4b27697]
- Updated dependencies [e40ca65]
- Updated dependencies [8ff3c6a]
- Updated dependencies [f92557e]
- Updated dependencies [e540eba]
  - @palantir/pack.document-schema.type-gen@0.12.0
  - @palantir/pack.document-schema.model-types@0.11.0

## 0.9.0

### Patch Changes

- @palantir/pack.document-schema.model-types@0.10.0
- @palantir/pack.document-schema.type-gen@0.11.0

## 0.8.0

### Minor Changes

- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [2153788]
- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.type-gen@0.10.0
  - @palantir/pack.document-schema.model-types@0.9.0

## 0.7.0

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [792a1b0]
- Updated dependencies [2d23ccf]
- Updated dependencies [e576652]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.document-schema.type-gen@0.9.0

## 0.6.1

### Patch Changes

- Updated dependencies [104c969]
- Updated dependencies [7081b06]
- Updated dependencies [212466e]
- Updated dependencies [1f6f084]
- Updated dependencies [222308b]
  - @palantir/pack.document-schema.type-gen@0.8.0

## 0.6.0

### Patch Changes

- Updated dependencies [2a2b839]
- Updated dependencies [008fb6c]
  - @palantir/pack.document-schema.type-gen@0.7.0

## 0.5.0

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0
  - @palantir/pack.document-schema.type-gen@0.6.0

## 0.4.0

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0
  - @palantir/pack.document-schema.type-gen@0.5.0

## 0.3.0

### Patch Changes

- Updated dependencies [09e51b1]
  - @palantir/pack.document-schema.model-types@0.5.0
  - @palantir/pack.document-schema.type-gen@0.4.0

## 0.2.0

### Patch Changes

- Updated dependencies [ceb06a9]
- Updated dependencies [8109bd7]
  - @palantir/pack.document-schema.type-gen@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0
  - @palantir/pack.document-schema.type-gen@0.2.2

## 0.1.3

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.document-schema.type-gen@0.2.1

## 0.1.2

### Patch Changes

- 571578c: Add Booleans to pack.schema
- 6098bed: Fix template package.json ordering
- 7ee55de: Bump dependencies
- 4a44875: Remove bun-specific scripts and dependency
- 6098bed: pack template determines the version of @palantir/pack.document-schema.model-types from the type-gen dependency after generation
- Updated dependencies [9f45b8e]
- Updated dependencies [571578c]
- Updated dependencies [862daf6]
- Updated dependencies [15f7f90]
- Updated dependencies [7ee55de]
- Updated dependencies [4a44875]
- Updated dependencies [8057223]
- Updated dependencies [19b8f5b]
- Updated dependencies [94f73a4]
  - @palantir/pack.document-schema.model-types@0.3.0
  - @palantir/pack.document-schema.type-gen@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [4c038f5]
  - @palantir/pack.document-schema.type-gen@0.1.1

## 0.1.0

### Minor Changes

- dfeaeb0: Fix bug in core, where multiple yDocs could get created, causing the initial update to be dropped

### Patch Changes

- Updated dependencies [dfeaeb0]
  - @palantir/pack.document-schema.type-gen@0.1.0

## 0.0.4

### Patch Changes

- bcb62e8: Fix package names generated by type-gen
- f61268d: Fix package names in generated models
- 4ab9c98: Update @osdk/foundry.pack dependency, add searchDocuments to FoundryEventService
- eba27ae: Fix issues locating model metadata when multiple copies of the schema package are present
- 20bb496: Execute type-gen package via bin, with node, instead of pnpm
- 8b0f997: Fix pack-template dependency
- Updated dependencies [bcb62e8]
- Updated dependencies [f61268d]
- Updated dependencies [4ab9c98]
- Updated dependencies [eba27ae]
  - @palantir/pack.document-schema.type-gen@0.0.4

## 0.0.4-beta.3

### Patch Changes

- ce86799: Fix pack-template dependency

## 0.0.4-beta.2

### Patch Changes

- a2688f6: Fix package names generated by type-gen
- Updated dependencies [a2688f6]
  - @palantir/pack.document-schema.type-gen@0.0.4-beta.1

## 0.0.4-beta.1

### Patch Changes

- d8582e5: Fix package names in generated models
- Updated dependencies [d8582e5]
  - @palantir/pack.document-schema.type-gen@0.0.4-beta.0

## 0.0.4-beta.0

### Patch Changes

- 6e833f1: Execute type-gen package via bin, with node, instead of pnpm

## 0.0.3

### Patch Changes

- fcb7a68: Fix CLIs to use node
- Updated dependencies [fcb7a68]
  - @palantir/pack.document-schema.type-gen@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [aa031e0]
  - @palantir/pack.document-schema.type-gen@0.0.2

## 0.0.1

### Patch Changes

- 57d1574: Add pack-template
- Updated dependencies [1519a68]
  - @palantir/pack.document-schema.type-gen@0.0.1
