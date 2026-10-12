---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.foundry": minor
---

Expose PACK published document versions through `DocumentService`/`app.state`. Documents can now be published as immutable, named snapshots and their versions listed, loaded by ref, resolved to the latest, and deleted, with frozen content read back as a merged binary Yjs update (`Uint8Array`). Published versions are not supported by the demo or in-memory document services.
