---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.foundry": minor
---

Support documents without an ontology and read document types through the V2 APIs. `ontologyRid` is now optional on document metadata (never fabricated), `presenceSupported` is read from the document and gates presence, and document types load via `loadV2`/`loadByNameV2` with the RID exposed only when the type is RID-backed.
