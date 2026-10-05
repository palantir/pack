---
"@palantir/pack.state.foundry-event": patch
---

Add outbox stats for debugging slow acks: queue size, oldest wait, highest send count, resends, and last ack latency. Logged on each resend tick and when 100 updates are unacked, and readable live via `globalThis.__PACK_DEBUG__.getOutboxStats()`.
