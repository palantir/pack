---
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.foundry-event": patch
"@palantir/pack.state.demo": patch
---

Maintain `live` status for the data and metadata channels. `DocumentStatus` exposes a `live: DocumentLiveStatus` per channel, but the Foundry implementation only ever set it for activity and presence — so `data.live` read `disconnected` permanently against a real stack while data synced perfectly, and `metadata.live` was never set by either implementation. A connection indicator bound to `data.live` therefore worked throughout development against `DemoDocumentService` and then read "disconnected" forever in production.

The data channel now reports `CONNECTING` while its subscription is being established, `CONNECTED` once it is, and `ERROR` if it cannot be established or the server sends a channel error. Data-integrity failures that leave the socket healthy — a revision gap, or an update that will not apply — continue to affect `load` only. The metadata channel reports liveness for its updates subscription in both the Foundry and Demo implementations, including `ERROR` — with the causing error attached — when the subscription fails while the metadata itself remains loaded over HTTP, which is precisely the distinction `live` exists to express.
