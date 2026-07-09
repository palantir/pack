---
"@palantir/pack.state.core": minor
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.foundry-event": minor
"@palantir/pack.state.demo": minor
---

Bump `@osdk/foundry.pack` to `^2.68.0`, surface `owningApplicationId` on document types, and add document-to-application resolution.

The SDK adds `owningApplicationId` to the wire `DocumentType`, populated from the type's
metadata. `DocumentType` (state.core) now carries `owningApplicationId?: string` and
`FoundryDocumentService` maps it through, so it rides along on every
`loadDocumentTypeByName` / `getDocumentType` call.

Adds `resolveDocumentApplication(docRef)` to `DocumentService` (and `app.state`), backed by
the new `GET /v2/pack/documents/{documentId}/resolveApplication` endpoint. Given a document,
it resolves the owning application id from the document's type metadata, returning `undefined`
when none is configured. Unsupported on the in-memory and demo services.

`createDocumentEditDescription` no longer sends the deprecated `eventData.version` or top-level
`eventType` fields (both are now optional in the SDK/API and superseded by `eventData.schemaVersion`
and `eventData.eventType`).
