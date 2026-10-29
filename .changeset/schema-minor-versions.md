---
"@palantir/pack.schema": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
---

Add schema minor versions. `nextSchema(previous, { bump: "minor" })` creates the next minor version (e.g. 1.0 → 1.1), which may add fields and new models; `build()` throws for `derivedFrom`, deprecations, and adding or removing union variants. Minor-version fields are added to the existing per-major SDK types, so apps can write them as soon as documents reach that major. A required field added in a minor version gets an upgrade function keyed by that version (e.g. `v1_1`), the same as in a major version.

`type-gen` records `addedInMinorVersion` in the IR, sends `schemaMinorVersion` from `ir update-schema` and `ir asset`, and accepts versions like `2.1` for `schema ir --max-version`. `ir update-schema` and `ir asset` now use the latest entry of the chain instead of the first entry of the latest major. A third-party `ir deploy` must be at a `.0` version.
