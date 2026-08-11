---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.schema": minor
---

Document Type schemas can now declare a field as a reference to an arbitrary platform resource via the new `resourceRef` field type, written as `S.ResourceRef`. Such fields surface as the new `ResourceRid` type in generated read and write types, matching the `string` / `z.string()` internal representation, and are reported through model metadata as `externalRefFieldTypes: { <field>: "resourceRef" }`. The generated document type asset carries the field as `{ type: "resourceRef" }`, allowing backpack to identify and extract resource references from document content.

Also fixes `RecordModelMetadata.externalRefFieldTypes` to be partial. It was `Record<keyof T, ExternalRefType>`, which required an entry for _every_ field in the model, so any model combining a reference field with ordinary fields produced a generated `models.ts` that did not typecheck.
