---
"@palantir/pack.state.core": patch
"@palantir/pack.state.demo": patch
"@palantir/pack.state.foundry-event": patch
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.react": patch
---

Fix document subscription ownership so activity, presence, metadata, and data channels are shared and cleaned up according to their own subscribers. Preserve client identity across data restarts, safely discard canceled asynchronous opens, and apply presence self-update filtering per subscriber.
