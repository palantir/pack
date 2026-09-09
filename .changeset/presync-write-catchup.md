---
"@palantir/pack.state.foundry-event": patch
---

Stop discarding local writes made while a document's initial load is in flight. Between the Yjs `update` listener being attached in `startDocumentSync` and the server's first revision arriving, local updates hit a `lastRevisionId == null` check and were dropped with only a log line. The publish payload carries no revision of its own — the server resolves a publish against the revision the client last acknowledged on its update subscription — so there was nothing to publish against yet. Nothing surfaced the loss: the writing client read its own value back correctly, while the update never reached the server and peers never saw it. Those updates are now held and flushed in order once the first revision establishes `lastRevisionId`.

Two cases that were previously silent now say so. Held updates that are still queued when sync stops are discarded with a warning rather than quietly, since a load that never completes leaves them with nothing to publish against. A queue that grows past a threshold warns that the load looks stuck instead of accumulating unnoticed.

Two windows remain, both of them earlier than the one this fixes, and both still silent.

Writes made before any data subscription opens are still lost: the `update` listener is only attached when the first data subscription registers, so those transactions produce no event to publish.

Writes made _during_ the open are also still lost. `FoundryDocumentService.onDataSubscriptionOpened` reports `load: LOADING` and `live: CONNECTING`, then awaits `waitForMetadataLoad` — an HTTP round-trip — before calling `startDocumentSync`, which is where the publish-side listener is attached. Across that window the document already reports itself as loading, but a write produces no publish event at all, so it is dropped with neither a queue entry nor a log line. That window is plausibly longer than the one the queue covers. Closing it means hoisting the hold into `FoundryDocumentService`, which owns the `Y.Doc` for the whole open, rather than `FoundryEventService`, which does not exist until `startDocumentSync` runs.
