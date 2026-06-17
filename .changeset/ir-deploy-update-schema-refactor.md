---
"@palantir/pack.document-schema.type-gen": minor
---

Refactor deploy/update-schema to be IR-sourced. `ir deploy` now supports both third-party (`DocumentTypes.create`) and first-party (`--first-party` → `DocumentTypes.createFirstParty`) document types; add `ir update-schema` sourced from IR; remove the `asset deploy` / `asset update-schema` commands. `ir asset` now emits `documentStorageType` in the flat api-gateway shape (`{ type: "yjs", schema }`).
