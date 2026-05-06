# @palantir/pack.state.foundry-event

## 0.14.0

### Minor Changes

- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.model-types@0.9.0
  - @palantir/pack.state.core@0.12.0

## 0.13.0

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [792a1b0]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.state.core@0.11.0

## 0.12.0

### Minor Changes

- 71255f9: Switch to use client supported version range instead of single client version

## 0.11.0

### Minor Changes

- 646de2f: Bundle cometd directly into pack.state.foundry-event to avoid issues with different loaders needing to understand its module packaging
- 45f9caf: add client version to subscriptions
- 2a2b839: fix cometd dev mode resolution

## 0.10.0

### Minor Changes

- cd09e6f: Add metadata update channel

## 0.9.0

### Minor Changes

- 2ccb561: Update activity event types and add document operations to metadata

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0
  - @palantir/pack.state.core@0.10.0

## 0.8.0

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0
  - @palantir/pack.state.core@0.9.0

## 0.7.0

### Patch Changes

- Updated dependencies [8117bbe]
  - @palantir/pack.state.core@0.8.0

## 0.6.0

### Patch Changes

- Updated dependencies [09e51b1]
- Updated dependencies [63409f4]
  - @palantir/pack.document-schema.model-types@0.5.0
  - @palantir/pack.state.core@0.7.0

## 0.5.0

### Patch Changes

- Updated dependencies [5c7e2a2]
  - @palantir/pack.state.core@0.6.0

## 0.4.0

### Minor Changes

- 72c058b: remove hardcoded metadata response values
- ceb06a9: make filesystem type required option for doc type deploy
- 8109bd7: add compass filesystem option for document type and doc creation

### Patch Changes

- Updated dependencies [72c058b]
- Updated dependencies [ceb06a9]
- Updated dependencies [8109bd7]
  - @palantir/pack.state.core@0.5.0

## 0.3.0

### Minor Changes

- bb1ba4e: update ephemeral events and custom presence event types and search request query

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0
  - @palantir/pack.state.core@0.4.0

## 0.2.1

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.state.core@0.3.1
  - @palantir/pack.auth@0.1.2
  - @palantir/pack.core@0.2.2

## 0.2.0

### Minor Changes

- 83e4a85: Replace local presence types with @osdk/foundry.pack types. Update presence events to use new type format.

### Patch Changes

- b02d9b7: Lazy load cometd dep and declare side-effects
- 571578c: Add Booleans to pack.schema
- fcf8655: Fix AckExtension side-effect not referencing the proper cometD module
- 7ee55de: Bump dependencies
- 4a44875: Remove bun-specific scripts and dependency
- Updated dependencies [9f45b8e]
- Updated dependencies [571578c]
- Updated dependencies [862daf6]
- Updated dependencies [87f1e63]
- Updated dependencies [e6e40f7]
- Updated dependencies [15f7f90]
- Updated dependencies [7ee55de]
- Updated dependencies [4a44875]
- Updated dependencies [8057223]
- Updated dependencies [19b8f5b]
  - @palantir/pack.document-schema.model-types@0.3.0
  - @palantir/pack.state.core@0.3.0
  - @palantir/pack.core@0.2.1
  - @palantir/pack.auth@0.1.1

## 0.1.2

### Patch Changes

- 0954a30: Relax validation on transaction editDescription for build environments that have duplicated @palantir/pack.document-schema.model-types. Adds a warning when this is detected
- Updated dependencies [0954a30]
  - @palantir/pack.document-schema.model-types@0.2.2
  - @palantir/pack.state.core@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [c2012a1]
  - @palantir/pack.document-schema.model-types@0.2.1
  - @palantir/pack.state.core@0.2.1

## 0.1.0

### Minor Changes

- dfeaeb0: Fix bug in core, where multiple yDocs could get created, causing the initial update to be dropped

### Patch Changes

- Updated dependencies [dfeaeb0]
  - @palantir/pack.document-schema.model-types@0.2.0
  - @palantir/pack.state.core@0.2.0
  - @palantir/pack.auth@0.1.0
  - @palantir/pack.core@0.2.0

## 0.0.2

### Patch Changes

- 4ab9c98: Update @osdk/foundry.pack dependency, add searchDocuments to FoundryEventService
- eba27ae: Fix issues locating model metadata when multiple copies of the schema package are present
- 67df6e4: Documented public apis
- Updated dependencies [eba27ae]
- Updated dependencies [67df6e4]
  - @palantir/pack.document-schema.model-types@0.1.1
  - @palantir/pack.core@0.1.1
  - @palantir/pack.state.core@0.1.1
  - @palantir/pack.auth@0.0.2

## 0.0.1

### Patch Changes

- 09f7acd: Add activity & presence custom event subscriptions
- 99d9186: Add doc transactions for grouping multiple edits, and include an optional edit description for activity/history
- fe9891e: Add new state packages
- Updated dependencies [8ed48e6]
- Updated dependencies [8698373]
- Updated dependencies [09f7acd]
- Updated dependencies [99d9186]
- Updated dependencies [77c07c4]
- Updated dependencies [27a3b33]
- Updated dependencies [511ee0c]
- Updated dependencies [3ebc927]
- Updated dependencies [fe9891e]
  - @palantir/pack.auth@0.0.1
  - @palantir/pack.core@0.1.0
  - @palantir/pack.document-schema.model-types@0.1.0
  - @palantir/pack.state.core@0.1.0
