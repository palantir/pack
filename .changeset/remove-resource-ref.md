---
"@palantir/pack.schema": minor
"@palantir/pack.document-schema.type-gen": minor
---

Remove the `S.ResourceRef` field type, which stored a bare RID string, and the `resourceRef` IR field type. Use `S.ResourceIdentifierRef`. It also holds a RID string, but the SDK stores it as a tagged ref so peering can translate it.
