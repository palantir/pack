---
"@palantir/pack.state.foundry-event": patch
---

Let the bundled cometd load in Worker and SharedWorker scopes. cometd resolves its browser globals off `window` rather than `globalThis` — it reads `window.setTimeout` while constructing a CometD instance and `window.WebSocket` when registering transports — so subscribing threw `ReferenceError: window is not defined` in a worker, surfacing as "Failed to subscribe to metadata updates" while the document still loaded over HTTP and simply never went live. `lazyLoadCometD` now aliases `window` to the global scope before importing cometd, guarded on `WebSocket` being present and on there being no real `window` to overwrite. This is an alias rather than a stub: every API cometd touches on the websocket path exists in worker scope, just not under that name. The one exception, `sessionStorage`, is read only by `ReloadExtension.js`, which this package never loads.

Also names the `CometD` constructor explicitly in the loader's return value. When cometd resolves through CJS interop, the module namespace exposes its exports via non-enumerable accessors, so the object spread dropped the constructor and left consumers with `TypeError: CometD is not a constructor`.
