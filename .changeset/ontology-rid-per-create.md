---
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.core": minor
---

Allow `createDocument` to target a specific ontology via `CreateDocumentMetadata.ontologyRid`.

When provided, the document is created in that ontology (the target ontology travels in the create
request body); when omitted, the app's default ontology is used. This lets multi-tenant hosts create
documents in different ontologies without a separate OSDK client per ontology — the app's single
client is used regardless, since its bound ontology does not affect document creation.
