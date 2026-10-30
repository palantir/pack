---
"@palantir/pack.state.demo": minor
---

Add a per-tab sync delay to the demo document service for testing concurrent edits. `demoSyncDelay.setDelayMs(ms)` holds this tab's document edits and activity events for `ms` before other tabs receive them, in order; `flush()` sends them at once.
