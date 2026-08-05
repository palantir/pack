---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.schema": minor
---

Document Type schemas can now declare a field as a reference to a Gotham artifact via the new `artifactRef` field type, written as `S.ArtifactRef`. Such fields surface as the new `ArtifactRid` type — a flavored string holding the bare artifact rid — in generated read and write types, matching the `string` / `z.string()` internal representation, and are reported through model metadata as `externalRefFieldTypes: { <field>: "artifactRef" }`. The generated document type asset carries the field as `{ type: "artifactRef" }`, which lets backpack label the field when introspecting a document's Yjs contents and extract the referenced artifact — the prerequisite for artifact references peering alongside a Document.

Also fixes `RecordModelMetadata.externalRefFieldTypes` to be partial. It was `Record<keyof T, ExternalRefType>`, which required an entry for *every* field in the model, so any model combining a reference field with ordinary fields produced a generated `models.ts` that did not typecheck.
