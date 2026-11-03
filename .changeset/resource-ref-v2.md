---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.schema": minor
"@palantir/pack.state.core": minor
---

Add `S.ResourceRefV2`, a resource reference that peering can translate across stacks. Apps read and write it as a `ResourceRid` string, like `S.ResourceRef`. The SDK stores it in Yjs as one tagged value, `{ __packRef: 1, __type: "resourceRef", __ref: "<rid>" }`, so backpack can find each reference from the update alone, without the document's schema. Existing `S.ResourceRef` fields are unchanged.

`S.ResourceRef` is now deprecated in favor of `S.ResourceRefV2`. Existing `ResourceRef` fields keep working; to move one over, add a `ResourceRefV2` field next to it instead of changing its type.

Asset generation and deploys reject `resourceRefV2` for now, until the platform API supports it.
