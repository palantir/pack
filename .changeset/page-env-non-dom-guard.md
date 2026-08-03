---
"@palantir/pack.app": patch
---

Guard meta tag reads against non-DOM scopes. `getPageEnv` called `document.querySelectorAll` unconditionally, so it threw `ReferenceError: document is not defined` in a Worker, SharedWorker, or Node scope — the only DOM dependency left on PACK's worker path. `getMetaTagContent` now returns `null` when `document` is undefined, so callers fall back to their explicit `options` and get the normal "missing configuration" errors instead of a `ReferenceError`. Browser behavior is unchanged.
