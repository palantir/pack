---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.demo": patch
"@palantir/pack.state.foundry": minor
---

Load published document versions as read-only document refs. `app.state.loadPublishedVersionDocRef(docRef, ref)` and `app.state.loadLatestPublishedVersionDocRef(docRef)` return a `PublishedVersionDocumentRef` that reads the frozen version through the same records, collections, and hooks as the live draft. Writes are rejected, presence and activity are no-ops, and metadata comes from the live draft. It has the same `id` as the live draft, so use `isPublishedVersionDocRef` or `publishedVersion.ref` to tell them apart.

Fix live sync not restarting when a document is opened again after its last `useRecord` (or `onInvalid`) subscriber closed. Its data status stayed loaded, so sync never reconnected.
