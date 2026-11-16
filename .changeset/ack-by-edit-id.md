---
"@palantir/pack.state.foundry-event": patch
---

Ack sent document edits by `editId` alone, instead of only when the server's update carries this tab's `clientId`. Edits that come back in a gap fill under another tab's `clientId` are now acked right away instead of being resent. This also lets the backend later save edits from several tabs in one batch.
