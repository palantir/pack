# @palantir/pack.state.foundry

## 0.21.1

### Patch Changes

- Updated dependencies [9106d61]
  - @palantir/pack.state.foundry-event@0.20.1

## 0.21.0

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
  - @palantir/pack.state.foundry-event@0.20.0

## 0.20.0

### Minor Changes

- a1580ba: Deduplicate schema version / lense logic

### Patch Changes

- Updated dependencies [a1580ba]
  - @palantir/pack.document-schema.model-types@0.14.0
  - @palantir/pack.state.foundry-event@0.19.0
  - @palantir/pack.state.core@0.17.0
  - @palantir/pack.auth@0.5.0
  - @palantir/pack.core@0.6.0

## 0.19.0

### Minor Changes

- a98cdbc: Add `max-version` parameter to schema IR generation to cap generation at a given version
- d86ec14: Extend versioning to activity and presence events
- aac4760: calculate document maximum write version
- c872dde: Use backend-calculated document operational versions for schema version gating.

  Foundry document loads now provide the document's operational version, which Pack stores on document metadata and uses as the fallback version for writes that do not have a lower calculated update schema version.

### Patch Changes

- Updated dependencies [a98cdbc]
- Updated dependencies [d86ec14]
- Updated dependencies [aac4760]
- Updated dependencies [2026c0a]
- Updated dependencies [c872dde]
  - @palantir/pack.document-schema.model-types@0.13.0
  - @palantir/pack.state.foundry-event@0.18.0
  - @palantir/pack.state.core@0.16.0
  - @palantir/pack.auth@0.4.0
  - @palantir/pack.core@0.5.0

## 0.18.0

### Minor Changes

- 98803f7: Add version-safe update methods to DocumentRef
- e49616d: add endpoints for document type metadata, including operational version

### Patch Changes

- Updated dependencies [98803f7]
- Updated dependencies [e49616d]
  - @palantir/pack.document-schema.model-types@0.12.0
  - @palantir/pack.state.foundry-event@0.17.0
  - @palantir/pack.state.core@0.15.0
  - @palantir/pack.auth@0.3.0
  - @palantir/pack.core@0.4.0

## 0.17.0

### Minor Changes

- d44fe3f: Allow `createDocument` to target a specific ontology via `CreateDocumentMetadata.ontologyRid`.

  When provided, the document is created in that ontology (the target ontology travels in the create
  request body); when omitted, the app's default ontology is used. This lets multi-tenant hosts create
  documents in different ontologies without a separate OSDK client per ontology — the app's single
  client is used regardless, since its bound ontology does not affect document creation.

- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [d44fe3f]
- Updated dependencies [e540eba]
  - @palantir/pack.state.core@0.14.0
  - @palantir/pack.document-schema.model-types@0.11.0
  - @palantir/pack.state.foundry-event@0.16.0

## 0.16.0

### Patch Changes

- Updated dependencies [597bb0c]
  - @palantir/pack.state.foundry-event@0.15.0
  - @palantir/pack.core@0.3.0
  - @palantir/pack.auth@0.2.0
  - @palantir/pack.document-schema.model-types@0.10.0
  - @palantir/pack.state.core@0.13.0

## 0.15.0

### Minor Changes

- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.model-types@0.9.0
  - @palantir/pack.state.foundry-event@0.14.0
  - @palantir/pack.state.core@0.12.0

## 0.14.0

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [792a1b0]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.state.core@0.11.0
  - @palantir/pack.state.foundry-event@0.13.0

## 0.13.0

### Minor Changes

- 71255f9: Switch to use client supported version range instead of single client version

### Patch Changes

- Updated dependencies [71255f9]
  - @palantir/pack.state.foundry-event@0.12.0

## 0.12.0

### Minor Changes

- 646de2f: Bundle cometd directly into pack.state.foundry-event to avoid issues with different loaders needing to understand its module packaging
- 45f9caf: add client version to subscriptions
- 2a2b839: fix cometd dev mode resolution

### Patch Changes

- Updated dependencies [646de2f]
- Updated dependencies [45f9caf]
- Updated dependencies [2a2b839]
  - @palantir/pack.state.foundry-event@0.11.0

## 0.11.0

### Minor Changes

- cd09e6f: Add metadata update channel

### Patch Changes

- Updated dependencies [cd09e6f]
  - @palantir/pack.state.foundry-event@0.10.0

## 0.10.0

### Minor Changes

- 2ccb561: Update activity event types and add document operations to metadata

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0
  - @palantir/pack.state.foundry-event@0.9.0
  - @palantir/pack.state.core@0.10.0

## 0.9.0

### Minor Changes

- 2b912f2: add discretionary security activity event

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0
  - @palantir/pack.state.core@0.9.0
  - @palantir/pack.state.foundry-event@0.8.0

## 0.8.0

### Minor Changes

- 8117bbe: add soft deletion api

### Patch Changes

- Updated dependencies [8117bbe]
  - @palantir/pack.state.core@0.8.0
  - @palantir/pack.state.foundry-event@0.7.0

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
  - @palantir/pack.state.foundry-event@0.6.0

## 0.5.0

### Minor Changes

- 5fa10ca: Convert wire security types for foundry backed documents

### Patch Changes

- Updated dependencies [5c7e2a2]
  - @palantir/pack.state.core@0.6.0
  - @palantir/pack.state.foundry-event@0.5.0

## 0.4.0

### Minor Changes

- 72c058b: remove hardcoded metadata response values
- 8109bd7: add compass filesystem option for document type and doc creation

### Patch Changes

- Updated dependencies [72c058b]
- Updated dependencies [ceb06a9]
- Updated dependencies [8109bd7]
  - @palantir/pack.state.foundry-event@0.4.0
  - @palantir/pack.state.core@0.5.0

## 0.3.0

### Minor Changes

- bb1ba4e: update ephemeral events and custom presence event types and search request query

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0
  - @palantir/pack.state.foundry-event@0.3.0
  - @palantir/pack.state.core@0.4.0

## 0.2.1

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.state.foundry-event@0.2.1
  - @palantir/pack.state.core@0.3.1
  - @palantir/pack.auth@0.1.2
  - @palantir/pack.core@0.2.2

## 0.2.0

### Minor Changes

- 15f7f90: fix search api to match required types and add search pagination
- 83e4a85: Replace local presence types with @osdk/foundry.pack types. Update presence events to use new type format.
- 8057223: Add metadata event types (platform events) and refactor demo app.

### Patch Changes

- 9f45b8e: Improve document creation API to separate create request from raw API types
- 571578c: Add Booleans to pack.schema
- 7ee55de: Bump dependencies
- 4a44875: Remove bun-specific scripts and dependency
- Updated dependencies [b02d9b7]
- Updated dependencies [9f45b8e]
- Updated dependencies [571578c]
- Updated dependencies [862daf6]
- Updated dependencies [87f1e63]
- Updated dependencies [fcf8655]
- Updated dependencies [e6e40f7]
- Updated dependencies [15f7f90]
- Updated dependencies [7ee55de]
- Updated dependencies [83e4a85]
- Updated dependencies [4a44875]
- Updated dependencies [8057223]
- Updated dependencies [19b8f5b]
  - @palantir/pack.state.foundry-event@0.2.0
  - @palantir/pack.document-schema.model-types@0.3.0
  - @palantir/pack.state.core@0.3.0
  - @palantir/pack.core@0.2.1
  - @palantir/pack.auth@0.1.1

## 0.1.2

### Patch Changes

- Updated dependencies [0954a30]
  - @palantir/pack.document-schema.model-types@0.2.2
  - @palantir/pack.state.foundry-event@0.1.2
  - @palantir/pack.state.core@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [c2012a1]
  - @palantir/pack.document-schema.model-types@0.2.1
  - @palantir/pack.state.core@0.2.1
  - @palantir/pack.state.foundry-event@0.1.1

## 0.1.0

### Minor Changes

- dfeaeb0: Fix bug in core, where multiple yDocs could get created, causing the initial update to be dropped

### Patch Changes

- Updated dependencies [dfeaeb0]
  - @palantir/pack.document-schema.model-types@0.2.0
  - @palantir/pack.state.foundry-event@0.1.0
  - @palantir/pack.state.core@0.2.0
  - @palantir/pack.auth@0.1.0
  - @palantir/pack.core@0.2.0

## 0.0.2

### Patch Changes

- 4ab9c98: Update @osdk/foundry.pack dependency, add searchDocuments to FoundryEventService
- eba27ae: Fix issues locating model metadata when multiple copies of the schema package are present
- Updated dependencies [4ab9c98]
- Updated dependencies [eba27ae]
- Updated dependencies [67df6e4]
  - @palantir/pack.state.foundry-event@0.0.2
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
  - @palantir/pack.state.foundry-event@0.0.1
  - @palantir/pack.state.core@0.1.0
