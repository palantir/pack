# @palantir/pack.state.react

## 0.19.0

### Minor Changes

- 6e3062b: Bump `@osdk/foundry.pack` to `^2.66.0` and surface document channel subscription errors as typed status.

  The SDK now exports `DocumentTypeAsset` (with an optional `comment` field), so the
  generator sources it from `@osdk/foundry.pack` instead of a hand-rolled interface
  (`irGenAssetHandler` / `irDeployHandler` import it directly; local `commands/types.ts`
  removed). Generated asset JSON is unchanged.

  Surface document channel subscription errors as typed status.

  Channel subscriptions (data, presence, activity) can fail — e.g. the client's
  schema version is below the document's operational version. Previously only the
  data channel reported this, via an untyped `DocumentStatus.dataError`, and
  presence/activity errors were dropped.

  `DocumentStatus` now reports per-channel health for all four channels
  (`data`, `metadata`, `presence`, `activity`), each carrying a typed
  `error?: ChannelError` with a `ChannelErrorCode` the UI can branch on
  (`clientVersionTooLow`, `revisionTooOld`, `operationalVersionBumped`,
  `internalError`, `unknown`). Use the new `useDocumentStatus` hook to observe it.

### Patch Changes

- Updated dependencies [6e3062b]
  - @palantir/pack.document-schema.model-types@0.15.0
  - @palantir/pack.state.core@0.18.0

## 0.18.0

### Minor Changes

- a1580ba: Deduplicate schema version / lense logic

### Patch Changes

- Updated dependencies [a1580ba]
  - @palantir/pack.document-schema.model-types@0.14.0
  - @palantir/pack.state.core@0.17.0
  - @palantir/pack.auth@0.5.0
  - @palantir/pack.core@0.6.0

## 0.17.0

### Minor Changes

- a98cdbc: Add `max-version` parameter to schema IR generation to cap generation at a given version
- d86ec14: Extend versioning to activity and presence events
- c872dde: Use backend-calculated document operational versions for schema version gating.

  Foundry document loads now provide the document's operational version, which Pack stores on document metadata and uses as the fallback version for writes that do not have a lower calculated update schema version.

### Patch Changes

- Updated dependencies [a98cdbc]
- Updated dependencies [d86ec14]
- Updated dependencies [aac4760]
- Updated dependencies [2026c0a]
- Updated dependencies [c872dde]
  - @palantir/pack.document-schema.model-types@0.13.0
  - @palantir/pack.state.core@0.16.0
  - @palantir/pack.auth@0.4.0
  - @palantir/pack.core@0.5.0

## 0.16.0

### Minor Changes

- 98803f7: Add version-safe update methods to DocumentRef
- e49616d: add endpoints for document type metadata, including operational version

### Patch Changes

- Updated dependencies [98803f7]
- Updated dependencies [e49616d]
  - @palantir/pack.document-schema.model-types@0.12.0
  - @palantir/pack.state.core@0.15.0
  - @palantir/pack.auth@0.3.0
  - @palantir/pack.core@0.4.0

## 0.15.0

### Minor Changes

- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [d44fe3f]
- Updated dependencies [e540eba]
  - @palantir/pack.state.core@0.14.0
  - @palantir/pack.document-schema.model-types@0.11.0

## 0.14.0

### Patch Changes

- Updated dependencies [597bb0c]
  - @palantir/pack.core@0.3.0
  - @palantir/pack.auth@0.2.0
  - @palantir/pack.document-schema.model-types@0.10.0
  - @palantir/pack.state.core@0.13.0

## 0.13.0

### Minor Changes

- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.model-types@0.9.0
  - @palantir/pack.state.core@0.12.0

## 0.12.0

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [792a1b0]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.state.core@0.11.0

## 0.11.0

### Minor Changes

- cd09e6f: Add metadata update channel

## 0.10.0

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0
  - @palantir/pack.state.core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0
  - @palantir/pack.state.core@0.9.0

## 0.8.0

### Minor Changes

- 8117bbe: add soft deletion api

### Patch Changes

- Updated dependencies [8117bbe]
  - @palantir/pack.state.core@0.8.0

## 0.7.0

### Minor Changes

- d0bdb16: add security activity event

## 0.6.0

### Minor Changes

- 09e51b1: add update metadata api and demo canvas metadata
- 63409f4: add security field to metadata to enable editing

### Patch Changes

- Updated dependencies [09e51b1]
- Updated dependencies [63409f4]
  - @palantir/pack.document-schema.model-types@0.5.0
  - @palantir/pack.state.core@0.7.0

## 0.5.0

### Minor Changes

- 5c7e2a2: add build and test step to release pr

### Patch Changes

- Updated dependencies [5c7e2a2]
  - @palantir/pack.state.core@0.6.0

## 0.4.0

### Minor Changes

- 72c058b: remove hardcoded metadata response values
- ceb06a9: make filesystem type required option for doc type deploy

### Patch Changes

- Updated dependencies [72c058b]
- Updated dependencies [ceb06a9]
- Updated dependencies [8109bd7]
  - @palantir/pack.state.core@0.5.0

## 0.3.2

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0
  - @palantir/pack.state.core@0.4.0

## 0.3.1

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.state.core@0.3.1
  - @palantir/pack.auth@0.1.2
  - @palantir/pack.core@0.2.2

## 0.3.0

### Minor Changes

- 74eb5b7: Change useRecord loading state to use status field. Consumers should use status field to determine whether a record is loading, loaded or deleted. Removed isLoading to better discriminate records that have been deleted and have no data.
- 15f7f90: fix search api to match required types and add search pagination

### Patch Changes

- 571578c: Add Booleans to pack.schema
- 87f1e63: Support for demo mode (offline) document services
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

## 0.2.2

### Patch Changes

- Updated dependencies [0954a30]
  - @palantir/pack.document-schema.model-types@0.2.2
  - @palantir/pack.state.core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [c2012a1]
  - @palantir/pack.document-schema.model-types@0.2.1
  - @palantir/pack.state.core@0.2.1

## 0.2.0

### Minor Changes

- dfeaeb0: Fix bug in core, where multiple yDocs could get created, causing the initial update to be dropped

### Patch Changes

- Updated dependencies [dfeaeb0]
  - @palantir/pack.document-schema.model-types@0.2.0
  - @palantir/pack.state.core@0.2.0
  - @palantir/pack.auth@0.1.0
  - @palantir/pack.core@0.2.0

## 0.1.0

### Minor Changes

- 67df6e4: Renamed useDocumentMetadata to useDocMetadata for consistency

### Patch Changes

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
