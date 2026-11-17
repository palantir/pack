---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.state.core": minor
---

Store `DocRef`, `UserRef`, and `ObjectRef` field values as tagged refs, like `S.ResourceIdentifierRef`, so peering can translate them. Apps still read and write the id string. The SDK now saves `{ __packRef: 1, __type: "docRef" | "userRef" | "objectRef", __ref: "<id>" }` instead of the bare string. An `ObjectRef` value must be an object RID.
