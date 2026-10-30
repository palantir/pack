---
"@palantir/pack.core": patch
"@palantir/pack.document-schema.type-gen": patch
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.foundry-event": patch
---

Use the generated platform SDK instead of npm `@osdk/foundry.pack`. PACK now generates the Pack API client itself into `@palantir/pack.core` (imported as `@palantir/pack.core/generatedPlatformSdk`), and `state.foundry`, `state.foundry-event`, and `document-schema.type-gen` use it. This first version is generated from api-gateway 1.1871.1, which is already stable and matches what `@osdk/foundry.pack` 2.86.0 provides, so behavior and the api-gateway minimum don't change.
