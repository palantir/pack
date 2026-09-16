---
"@palantir/pack.document-schema.model-types": patch
"@palantir/pack.state.core": patch
"@palantir/pack.state.foundry-event": patch
---

Expose a persistent refresh-required document error when updates remain unacknowledged after the retry limit. Stop outgoing updates and block local record writes until a fresh document is loaded, while continuing to receive remote changes. The retry limit is only spent while the transport is connected, so a network outage no longer counts against it.
