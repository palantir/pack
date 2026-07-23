---
"@palantir/pack.state.foundry-event": patch
"@palantir/pack.state.foundry": patch
---

Surface previously-silent event and metadata failures as errors instead of leaving documents in a stale state. Revision gaps and failed remote Y.js updates now set the document load status to `ERROR` with a descriptive cause rather than silently returning while `lastRevisionId` was already advanced — so callers see the stale state instead of acting on it. CometD handshake failures caused by a missing auth token now reject the handshake promise with the underlying cause instead of hanging. Metadata load/subscription/refetch failures that occur after a subscription is closed or a document is replaced are now logged at `warn` level for observability instead of being dropped entirely.
