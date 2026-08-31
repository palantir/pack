---
"@palantir/pack.state.foundry-event": patch
---

Track published document updates until the server acks them (via the echoed `editId`), resending any that go unacked, so client→server delivery is resilient to dropped publishes. Resends re-publish the same message verbatim so the server can dedupe by `editId`.
