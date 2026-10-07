---
"@palantir/pack.state.react": minor
---

Add `usePublishedVersions` to list a document's published versions (latest first, with `refresh`), and `usePublishedVersionDocRef` to load a specific or the latest version as a read-only `PublishedVersionDocumentRef`. Both have `refresh`, which keeps the current result until the new one arrives.
