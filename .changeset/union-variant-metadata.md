---
"@palantir/pack.document-schema.type-gen": patch
---

Record the version each union variant was added in. When a union gains a variant in a later schema version, the IR and the schema that `ir asset`, `ir update-schema`, and `ir deploy` send include `variantMetadata` for that variant. Unions that never gained a variant are unchanged.
