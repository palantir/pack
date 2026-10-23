---
"@palantir/pack.schema": patch
"@palantir/pack.document-schema.type-gen": patch
---

`formatVariantName` now lives in `@palantir/pack.schema`, so the schema builder's reserved-name check and type-gen share one copy instead of two that must match.
