---
"@palantir/pack.core": minor
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.foundry-event": minor
---

Use the generated platform SDK instead of npm `@osdk/foundry.pack`. PACK now generates the Pack API client itself into `@palantir/pack.core` (imported as `@palantir/pack.core/generatedPlatformSdk`), and `state.foundry`, `state.foundry-event`, and `document-schema.type-gen` use it. It is generated from api-gateway 1.1885.0, which adds union variant metadata (`variantMetadata`) and `Documents.recordView`. These packages now require api-gateway 1.1885.0 or newer, and gotham-objects-gateway 2.955.0 or newer on stacks that run it.
