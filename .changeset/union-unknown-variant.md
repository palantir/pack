---
"@palantir/pack.schema": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
---

Every generated union now has an `Unknown` case for variants the SDK doesn't know, such as ones added by a newer version of the app. Reading one returns `{ [discriminant]: "unknown", rawValue }` instead of failing validation and hiding the record. Writing a record, presence or activity that contains it writes the stored value back unchanged. This is a breaking change for app code: checks on a union's variant must now handle `"unknown"`, which TypeScript enforces. `"unknown"` is now a reserved variant name.
