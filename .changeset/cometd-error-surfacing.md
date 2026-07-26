---
"@palantir/pack.state.foundry-event": patch
---

Surface the underlying reason for CometD publish/subscribe/handshake failures. Client-side transport errors (e.g. `maxSendBayeuxMessageSize exceeded`) live in `message.failure.exception`/`.reason` rather than `message.error`, so they previously surfaced as a bare "Failed to publish" with no detail. Failures now include the real cause in the error message and attach the raw failure as the error `cause`.
