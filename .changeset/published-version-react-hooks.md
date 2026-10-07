---
"@palantir/pack.state.react": minor
---

Add `usePublishedVersions` to list a document's published versions (latest first, with `refresh`), `usePublishedVersionDocRef` to load one as a read-only `PublishedVersionDocumentRef`, and `useLatestPublishedVersionDocRef` to load the latest one. Each hook has `refresh`, which keeps the current result until the new one arrives.
