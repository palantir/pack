---
"@palantir/pack.state.foundry": patch
---

Generate the Foundry Pack platform SDK inside PACK from api-gateway 1.1871.1, so new Pack endpoints are available before `@osdk/foundry.pack` is published to npm. `@palantir/pack.state.foundry` no longer depends on `@osdk/foundry.pack` and now declares a minimum api-gateway version of 1.1871.1.
