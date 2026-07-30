---
"@palantir/pack.state.core": patch
---

Fix `waitForMetadataLoad` hanging forever when no metadata load will ever start. Metadata loads are demand-driven in the same way as data loads, but `waitForMetadataLoad` had none of the fast-fail guarding that `waitForDataLoad` gained: calling it on a document with no metadata subscription returned a promise that never settled, with no timeout and no status transition to wake it. It now rejects with the same explanatory message shape as the data path. The guard keys off the load status rather than the subscription flag, so an in-flight load is still awaited even after its subscription is dropped.
