---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.schema": minor
"@palantir/pack.state.core": minor
---

Unify additive defaults with upgrade fns; remove schema-level defaults.

The schema layer no longer carries field default values. Every required field added past v1 — derived or additive — must have a typed entry in the generated `DocumentUpgradeFns` interface, supplied to `DocumentModel({...})` at boot. Optional additive fields need no entry; the lens leaves them alone.

Breaking changes:
- `addField(name, type, { default: ... })` is no longer accepted. For required additive fields, register an entry like `opacity: () => 1.0` in `DocumentUpgradeFns`. For optional fields, drop the option and read `value ?? fallback` at the render site if needed.
- `FieldLensDef.default` and `FieldDef.default` are removed from `@palantir/pack.document-schema.model-types`. The runtime lens no longer reads a "step default" — every entry in a step's `fields` corresponds 1:1 with an entry in `UpgradeFns`.
- `chainHasDerivedFields` renamed to `chainNeedsUpgradeFns` and broadened to also return true when a required additive field is added past v1.
- `JsonValue` removed from `@palantir/pack.document-schema.model-types`.
