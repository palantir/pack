# @palantir/pack.document-schema.type-gen

## 0.19.0

### Minor Changes

- 9e9b29d: Include `owningApplicationId` when deploying a first-party document type via `ir deploy --first-party`. When set in `pack-config.json`, the value now flows through the IR chain payload into the `createFirstParty` request body, matching the existing `ir asset` behavior.

## 0.18.0

### Minor Changes

- 4fef953: Include `owningApplicationId` in the generated document type asset. When set in `pack-config.json`, the value flows through `schema ir` into the IR chain payload and `ir asset` writes it onto the `DocumentTypeAsset`.

## 0.17.0

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

- 11c75ce: Export union variant type guards as values from the generated versioned SDK `index.ts`.

  The versioned generator emits per-variant guard functions (e.g. `isShape_v1Circle`) into `types_vN.ts`, but `index.ts` only re-exported per-version symbols via `export type { ... }`. Since guards are runtime values, the type-only re-export erased them, leaving them unreachable from the package root — unlike the legacy non-versioned generator, whose flat `export *` carried them through.

  `generateIndexFromChain` now emits a per-version value export (`export { isFooBar_v1, ... } from "./types_vN.js"`) alongside the existing type-only export, so consumers can narrow a union at runtime without re-deriving the discriminant check. Records-only schemas are unaffected (no guards, no value export).

### Patch Changes

- Updated dependencies [6e3062b]
  - @palantir/pack.document-schema.model-types@0.15.0

## 0.16.0

### Minor Changes

- ba9fa6a: change comment field name

## 0.15.0

### Minor Changes

- a1580ba: Deduplicate schema version / lense logic
- a8432cf: Refactor deploy/update-schema to be IR-sourced. `ir deploy` now supports both third-party (`DocumentTypes.create`) and first-party (`--first-party` → `DocumentTypes.createFirstParty`) document types; add `ir update-schema` sourced from IR; remove the `asset deploy` / `asset update-schema` commands. `ir asset` now emits `documentStorageType` in the flat api-gateway shape (`{ type: "yjs", schema }`).

### Patch Changes

- Updated dependencies [a1580ba]
  - @palantir/pack.document-schema.model-types@0.14.0
  - @palantir/pack.schema@0.10.0

## 0.14.0

### Minor Changes

- a98cdbc: Add `max-version` parameter to schema IR generation to cap generation at a given version
- 0d90a68: refactor deploy command for chained ir schema input and demo build document type script for easier deployment.
- d86ec14: Extend versioning to activity and presence events
- aac4760: calculate document maximum write version
- 2026c0a: Unify additive defaults with upgrade fns; remove schema-level defaults.

  The schema layer no longer carries field default values. Every required field added past v1 — derived or additive — must have a typed entry in the generated `DocumentUpgradeFns` interface, supplied to `DocumentModel({...})` at boot. Optional additive fields need no entry; the lens leaves them alone.

  Breaking changes:

  - `addField(name, type, { default: ... })` is no longer accepted. For required additive fields, register an entry like `opacity: () => 1.0` in `DocumentUpgradeFns`. For optional fields, drop the option and read `value ?? fallback` at the render site if needed.
  - `FieldLensDef.default` and `FieldDef.default` are removed from `@palantir/pack.document-schema.model-types`. The runtime lens no longer reads a "step default" — every entry in a step's `fields` corresponds 1:1 with an entry in `UpgradeFns`.
  - `chainHasDerivedFields` renamed to `chainNeedsUpgradeFns` and broadened to also return true when a required additive field is added past v1.
  - `JsonValue` removed from `@palantir/pack.document-schema.model-types`.

### Patch Changes

- Updated dependencies [a98cdbc]
- Updated dependencies [d86ec14]
- Updated dependencies [aac4760]
- Updated dependencies [2026c0a]
- Updated dependencies [c872dde]
  - @palantir/pack.document-schema.model-types@0.13.0
  - @palantir/pack.schema@0.9.0

## 0.13.0

### Minor Changes

- 1cc9a09: included versions for added fields and models and deprecations
- 98803f7: Add version-safe update methods to DocumentRef

### Patch Changes

- Updated dependencies [1cc9a09]
- Updated dependencies [98803f7]
  - @palantir/pack.schema@0.8.0
  - @palantir/pack.document-schema.model-types@0.12.0

## 0.12.0

### Minor Changes

- 4b27697: fix schema shape for asset file
- e40ca65: Pipe minimum supported schema version from the SDK's pack-config so the IR is the single source of truth. `ir asset` now also emits a sibling `*-schema-compatibility-range.json` file required by the backend to compute operational versions for first-party apps.

  - `schema ir` now requires `--config <pack-config.json>`. Its optional `minSupportedVersion` field declares the oldest schema version this SDK supports; omit the field to track latest only.
  - `ir gen-types` no longer accepts `--min-version`; the value is read from the IR payload.
  - `pack-versioned-template` no longer prompts for `minVersion`; declare `minSupportedVersion` in your pack-config instead.

- 8ff3c6a: add update schema endpoint
- f92557e: move document type name and desc to pack config for downstream schema generation and generate runtime constants
- e540eba: Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.

### Patch Changes

- Updated dependencies [e540eba]
  - @palantir/pack.document-schema.model-types@0.11.0
  - @palantir/pack.schema@0.7.0

## 0.11.0

### Patch Changes

- Updated dependencies [b114b1a]
  - @palantir/pack.schema@0.6.0
  - @palantir/pack.document-schema.model-types@0.10.0

## 0.10.0

### Minor Changes

- 2153788: create flag for asset deploy to override api context path
- 3c7a9f3: Split IR Versioned Tasks
- 1ebb677: Always use the IR as intermediary between builders and SDK/Zod/Wire

### Patch Changes

- Updated dependencies [3c7a9f3]
- Updated dependencies [1ebb677]
  - @palantir/pack.document-schema.model-types@0.9.0
  - @palantir/pack.schema@0.5.0

## 0.9.0

### Minor Changes

- 2b00422: Add 'gen-types' command, along with scope, metadata and manifest generators
- 222e157: Wire in lens upgrade registry to reads in the yjs layer
- 792a1b0: Add new 'gen-types' command, direct from TS schema to Versioned SDK Types.
- 2d23ccf: Add internal and Zod generators to the sdk-gen command
- e576652: rm metadata field from record to match api shape

### Patch Changes

- Updated dependencies [2b00422]
- Updated dependencies [222e157]
- Updated dependencies [ad7a355]
- Updated dependencies [d6d49e3]
- Updated dependencies [792a1b0]
  - @palantir/pack.document-schema.model-types@0.8.0
  - @palantir/pack.schema@0.4.0

## 0.8.0

### Minor Changes

- 7081b06: update third party deploy handler to include schema
- 212466e: Create asset deploy command for first-party document type deployment
- 1f6f084: refactor schema types
- 222308b: Support nested generic types in YAML migration step parser

### Patch Changes

- 104c969: add comment to generated json files to not edit the files directly

## 0.7.0

### Minor Changes

- 2a2b839: fix cometd dev mode resolution
- 008fb6c: Generate asset from ir cli command

## 0.6.0

### Patch Changes

- Updated dependencies [2ccb561]
  - @palantir/pack.document-schema.model-types@0.7.0

## 0.5.0

### Patch Changes

- Updated dependencies [2b912f2]
  - @palantir/pack.document-schema.model-types@0.6.0

## 0.4.0

### Patch Changes

- Updated dependencies [09e51b1]
  - @palantir/pack.document-schema.model-types@0.5.0

## 0.3.0

### Minor Changes

- ceb06a9: make filesystem type required option for doc type deploy
- 8109bd7: add compass filesystem option for document type and doc creation

## 0.2.2

### Patch Changes

- Updated dependencies [bb1ba4e]
  - @palantir/pack.document-schema.model-types@0.4.0

## 0.2.1

### Patch Changes

- 5120719: Update dependency ranges
- Updated dependencies [5120719]
  - @palantir/pack.document-schema.model-types@0.3.1
  - @palantir/pack.schema@0.3.1

## 0.2.0

### Minor Changes

- 862daf6: Schema union types can define custom discriminant

### Patch Changes

- 571578c: Add Booleans to pack.schema
- 7ee55de: Bump dependencies
- 4a44875: Remove bun-specific scripts and dependency
- 94f73a4: add headers to generated output from sdkgen
- Updated dependencies [9f45b8e]
- Updated dependencies [571578c]
- Updated dependencies [862daf6]
- Updated dependencies [15f7f90]
- Updated dependencies [7ee55de]
- Updated dependencies [4a44875]
- Updated dependencies [8057223]
- Updated dependencies [19b8f5b]
  - @palantir/pack.document-schema.model-types@0.3.0
  - @palantir/pack.schema@0.3.0

## 0.1.1

### Patch Changes

- 4c038f5: Add preview flag to API call only available on preview

## 0.1.0

### Minor Changes

- dfeaeb0: Fix bug in core, where multiple yDocs could get created, causing the initial update to be dropped

### Patch Changes

- Updated dependencies [dfeaeb0]
  - @palantir/pack.schema@0.2.0

## 0.0.4

### Patch Changes

- bcb62e8: Fix package names generated by type-gen
- f61268d: Fix package names in generated models
- 4ab9c98: Update @osdk/foundry.pack dependency, add searchDocuments to FoundryEventService
- eba27ae: Fix issues locating model metadata when multiple copies of the schema package are present
- Updated dependencies [eba27ae]
  - @palantir/pack.schema@0.1.1

## 0.0.4-beta.1

### Patch Changes

- a2688f6: Fix package names generated by type-gen

## 0.0.4-beta.0

### Patch Changes

- d8582e5: Fix package names in generated models

## 0.0.3

### Patch Changes

- fcb7a68: Fix CLIs to use node

## 0.0.2

### Patch Changes

- aa031e0: Fix dependency

## 0.0.1

### Patch Changes

- 1519a68: Add type gen CLI package
- Updated dependencies [77c07c4]
- Updated dependencies [4a71da0]
  - @palantir/pack.schema@0.1.0
