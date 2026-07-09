# @palantir/pack.state.demo

## 0.17.0

### Minor Changes

- 9d0c61a: Bump `@osdk/foundry.pack` to `^2.68.0`, surface `owningApplicationId` on document types, and add document-to-application resolution.

  The SDK adds `owningApplicationId` to the wire `DocumentType`, populated from the type's
  metadata. `DocumentType` (state.core) now carries `owningApplicationId?: string` and
  `FoundryDocumentService` maps it through, so it rides along on every
  `loadDocumentTypeByName` / `getDocumentType` call.

  Adds `resolveDocumentApplication(docRef)` to `DocumentService` (and `app.state`), backed by
  the new `GET /v2/pack/documents/{documentId}/resolveApplication` endpoint. Given a document,
  it resolves the owning application id from the document's type metadata, returning `undefined`
  when none is configured. Unsupported on the in-memory and demo services.

  `createDocumentEditDescription` no longer sends the deprecated `eventData.version` or top-level
  `eventType` fields (both are now optional in the SDK/API and superseded by `eventData.schemaVersion`
  and `eventData.eventType`).

  `searchDocuments` accepts an optional `ontologyRid` in its options, forwarded to the search
  request to scope results to a specific ontology. Not defaulted — omitted when unset, in which
  case the document type name is searched across all ontologies.

### Patch Changes

- Updated dependencies [9d0c61a]
  - @palantir/pack.state.core@0.19.0

## 0.16.0

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

## 0.15.0

### Minor Changes

- a1580ba: Deduplicate schema version / lense logic

### Patch Changes

- Updated dependencies [a1580ba]
  - @palantir/pack.document-schema.model-types@0.14.0
  - @palantir/pack.state.core@0.17.0
  - @palantir/pack.core@0.6.0

## 0.14.0

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
  - @palantir/pack.core@0.5.0

## 0.13.0

### Minor Changes

- 98803f7: Add version-safe update methods to DocumentRef
- e49616d: add endpoints for document type metadata, including operational version

### Patch Changes

- Updated dependencies [98803f7]
- Updated dependencies [e49616d]
  - @palantir/pack.document-schema.model-types@0.12.0
  - @palantir/pack.state.core@0.15.0
  - @palantir/pack.core@0.4.0

## 0.12.0

### Minor Changes

- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [d44fe3f]
- Updated dependencies [e540eba]
  - @palantir/pack.state.core@0.14.0
  - @palantir/pack.document-schema.model-types@0.11.0

## 0.11.0

### Patch Changes

- Updated dependencies [597bb0c]
  - @palantir/pack.core@0.3.0
  - @palantir/pack.document-schema.model-types@0.10.0
  - @palantir/pack.state.core@0.13.0

## 0.10.0

### Minor Changes

- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.model-types@0.9.0
  - @palantir/pack.state.core@0.12.0

## 0.9.0

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [792a1b0]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.state.core@0.11.0

## 0.8.0

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0
  - @palantir/pack.state.core@0.10.0

## 0.7.0

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0
  - @palantir/pack.state.core@0.9.0

## 0.6.0

### Minor Changes

- 8117bbe: add soft deletion api

### Patch Changes

- Updated dependencies [8117bbe]
  - @palantir/pack.state.core@0.8.0

## 0.5.0

### Minor Changes

- 09e51b1: add update metadata api and demo canvas metadata

### Patch Changes

- Updated dependencies [09e51b1]
- Updated dependencies [63409f4]
  - @palantir/pack.document-schema.model-types@0.5.0
  - @palantir/pack.state.core@0.7.0

## 0.4.0

### Patch Changes

- Updated dependencies [5c7e2a2]
  - @palantir/pack.state.core@0.6.0

## 0.3.0

### Patch Changes

- Updated dependencies [72c058b]
- Updated dependencies [ceb06a9]
- Updated dependencies [8109bd7]
  - @palantir/pack.state.core@0.5.0

## 0.2.0

### Minor Changes

- bb1ba4e: update ephemeral events and custom presence event types and search request query

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0
  - @palantir/pack.state.core@0.4.0

## 0.1.1

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.state.core@0.3.1
  - @palantir/pack.core@0.2.2

## 0.1.0

### Minor Changes

- 15f7f90: fix search api to match required types and add search pagination

### Patch Changes

- 319660b: Fix demo client id new generation on page reloads
- 9f45b8e: Improve document creation API to separate create request from raw API types
- 887cab4: Fix demo service activity and presence implementation
- 87f1e63: Support for demo mode (offline) document services
- e6e40f7: Improve demo mode services and add offline demo oauth implementation
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
