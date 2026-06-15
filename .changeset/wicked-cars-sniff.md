---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.foundry-event": minor
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.demo": minor
"@palantir/pack.state.react": patch
---

Use backend-calculated document operational versions for schema version gating.

Foundry document loads now provide the document's operational version, which Pack stores on document metadata and uses as the fallback version for writes that do not have a lower calculated update schema version.
