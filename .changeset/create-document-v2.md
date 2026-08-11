---
"@palantir/pack.state.core": minor
"@palantir/pack.state.foundry": minor
---

Add backward-compatible support for the PACK `createV2` document endpoint. Existing
`createDocument` calls continue to use the legacy endpoint, while providing a namespace or folder
through `CreateDocumentMetadata.parent` opts into V2. Legacy and V2 routing fields cannot be
combined.
