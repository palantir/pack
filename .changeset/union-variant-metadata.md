---
"@palantir/pack.document-schema.type-gen": patch
"@palantir/pack.schema": patch
---

Record the version each union variant was added in. When a union gains a variant in a later schema version, the IR and the schema that `ir asset`, `ir update-schema`, and `ir deploy` send include `variantMetadata` for that variant. Unions that never gained a variant are unchanged. A minor version can now add union variants; older apps read them as unknown and keep them when they save.

If a third-party document type was first deployed after one of its unions had already gained a variant, the server recorded that variant at the union's version. The next `ir update-schema` then fails because the variant's version changed. Run that update once with `--force-overwrite`.
