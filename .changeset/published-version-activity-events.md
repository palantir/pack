---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.foundry": minor
---

Map `publishedVersionCreate` and `publishedVersionDelete` activity events to typed `ActivityEventDataType.PUBLISHED_VERSION_CREATE` and `PUBLISHED_VERSION_DELETE` events with `publishedVersionId`, `name`, and `description`. They were previously delivered as `UNKNOWN`.
