---
"@palantir/pack.create-app": minor
---

Add `@palantir/pack.create-app`, an `npx`-runnable CLI that scaffolds PACK starter
projects from built-in templates (`schema` and `workspace`). Supports first-party packs
(`--first-party`, `--owning-application-id`) that build a `com.palantir.pack.*` document
type asset, and third-party packs that deploy the document type to a Foundry stack.
