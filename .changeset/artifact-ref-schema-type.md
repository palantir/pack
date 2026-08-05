---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.schema": minor
---

Document Type schemas can now declare a field as a reference to a Gotham artifact via the new `artifactRef` field type. Such fields surface as the new `ArtifactRef` type (with an `artifactRid`) in generated read and write types, are stored as an opaque string internally, and are reported through model metadata as `externalRefFieldTypes: { <field>: "artifactRef" }`. The generated document type asset carries the field as `{ type: "artifactRef" }`, which lets backpack label the field when introspecting a document's Yjs contents and extract the referenced artifact — the prerequisite for artifact references peering alongside a Document.
