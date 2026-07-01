---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.foundry-event": minor
"@palantir/pack.state.react": minor
"@palantir/pack.state.demo": minor
---

Bump `@osdk/foundry.pack` to `^2.66.0` and surface document channel subscription errors as typed status.

The SDK now exports `DocumentTypeAsset` (with an optional `comment` field), so the
generator sources it from `@osdk/foundry.pack` instead of a hand-rolled interface
(`irGenAssetHandler` / `irDeployHandler` import it directly; local `commands/types.ts`
removed). Generated asset JSON is unchanged.

Surface document channel subscription errors as typed status.

Channel subscriptions (data, presence, activity) can fail — e.g. the client's
schema version is below the document's operational version. Previously only the
data channel reported this, via an untyped `DocumentStatus.dataError`, and
presence/activity errors were dropped.

`DocumentStatus` now reports per-channel health for all four channels
(`data`, `metadata`, `presence`, `activity`), each carrying a typed
`error?: ChannelError` with a `ChannelErrorCode` the UI can branch on
(`clientVersionTooLow`, `revisionTooOld`, `operationalVersionBumped`,
`internalError`, `unknown`). Use the new `useDocumentStatus` hook to observe it.
