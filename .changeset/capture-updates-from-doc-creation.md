---
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.foundry-event": minor
---

Stop losing local writes made before a document's first data subscription opens. The Yjs `update` listener that publishes local changes was attached in `startDocumentSync`, which only runs once a data subscription registers, so any earlier write produced no event and never reached the server. Nothing surfaced the loss — the writing client read its own value back correctly — and because a later update references struct ids from the unpublished operations, receiving peers hold it pending against a causal gap that never closes, making the record invisible rather than merely late.

Capture now begins when the document is created, via a new `FoundryEventService.beginDocumentCapture`. Updates are held and published against the first revision once a sync session establishes one, so each keeps its own edit description and schema version instead of being collapsed into a single full-state message.

Capture also outlives `stopDocumentSync`, so writes made while sync is stopped are held and published when it resumes; only `disposeDocument` tears capture down, warning if it discards updates that were never published. Sync runs are now tracked by an explicit token rather than by the identity of the update handler, which no longer implies that sync is active.

An update's schema version is resolved when it is published rather than when it is captured, since capture can happen before metadata loads, when the operational version is still a schema fallback that can understate what the content needs. Replacing a document's `Y.Doc` discards updates held for the previous one, with a warning, rather than publishing operations the current document does not have.

This is a minor rather than patch release for `@palantir/pack.state.foundry-event`: `beginDocumentCapture` is a required member of the exported `FoundryEventService` interface, so any external implementation of that interface needs to add it.
