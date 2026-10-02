---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.demo": patch
"@palantir/pack.state.foundry": minor
---

Load published document versions as read-only document refs. `app.state.loadPublishedVersionDocRef(docRef, ref)` and `app.state.loadLatestPublishedVersionDocRef(docRef)` return a `PublishedVersionDocumentRef` that reads the frozen version through the same records, collections, and hooks as the draft. Writes reject, presence and activity are no-ops, and metadata comes from the draft. It has the same `id` as the draft, so use `isPublishedVersionDocRef` or `publishedVersion.ref` to tell them apart. Custom document services can build one from downloaded contents with `openPublishedVersionDocRef`.
