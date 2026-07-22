---
"@palantir/pack.state.core": patch
"@palantir/pack.state.foundry": patch
---

Fix stale data-load status blocking document reopen. `waitForDataLoad` resolved off `dataStatus.load === LOADED`, which on reopen of a previously-loaded document could still read `LOADED` from the prior open — resolving against a torn-down subscription and leaving callers acting on stale state. The reset to `UNLOADED` on subscription close now lives in the base class (`closeDataSubscription`) and runs unconditionally on every close path, so subclasses can no longer skip it and a reopen re-runs the load. `waitForDataLoad` also now rejects (instead of hanging forever) when no data subscription is registered or when an in-flight load is canceled.
