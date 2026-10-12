---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.demo": patch
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.react": minor
---

Rename `PublishedVersionRef` to `PublishedVersionId` and `PublishedVersion.ref` to `PublishedVersion.id`, so a published version's id isn't mistaken for a ref object like `DocumentRef`. Methods that took a `ref` now take a `publishedVersionId`, and the `usePublishedVersionDocRef` selection is now `{ type: "specific", publishedVersionId }`. The server API still calls it `ref`; the value is unchanged.
