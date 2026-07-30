---
"@palantir/pack.state.foundry-event": patch
---

Stop discarding local writes made while a document's initial load is in flight. Between the Yjs `update` listener being attached in `startDocumentSync` and the server's first revision arriving, local updates hit a `lastRevisionId == null` check and were dropped with only a log line — a publish has to declare the revision it builds on, and there was none yet. Nothing surfaced the loss: the writing client read its own value back correctly, while the update never reached the server and peers never saw it. Those updates are now held and flushed in order once the first revision establishes `lastRevisionId`.

Two cases that were previously silent now say so. Held updates that are still queued when sync stops are discarded with a warning rather than quietly, since a load that never completes leaves them with nothing to publish against. A queue that grows past a threshold warns that the load looks stuck instead of accumulating unnoticed.

This does not address writes made before any data subscription opens. The `update` listener is only attached when the first data subscription registers, so those transactions still produce no event to publish and remain lost.
