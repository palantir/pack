---
"@palantir/pack.state.foundry": patch
---

Generate the Foundry Pack platform SDK inside PACK instead of depending on `@osdk/foundry.pack` from npm. This is the first test of that setup: it generates from api-gateway 1.1871.1, which is already stable and is the same minimum `@osdk/foundry.pack` 2.86.0 requires, so the api-gateway requirement doesn't change.
