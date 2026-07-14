---
"@palantir/pack.codegen.core": minor
"@palantir/pack.sdkgen": patch
---

Add `@palantir/pack.codegen.core`, a shared template-driven code generation engine
extracted from `@palantir/pack.sdkgen`, and refactor `@palantir/pack.sdkgen` to consume
it. The public API of `@palantir/pack.sdkgen` is unchanged.
