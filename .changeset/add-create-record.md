---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.state.core": minor
---

Add `docRef.createRecord(model, data, id?)`. It creates a record and returns its ref. PACK generates the ID unless you pass one. It rejects without writing if a record with that ID already exists or the document's data has not loaded yet. Generated SDKs get typed `createRecord` overloads for each schema version. `setRecord` is unchanged; its docs now point to `createRecord` for new records and `updateRecord` for edits.
