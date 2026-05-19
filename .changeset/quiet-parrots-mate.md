---
"@palantir/pack.sdkgen.pack-versioned-template": patch
"@palantir/pack.document-schema.model-types": patch
"@palantir/pack.sdkgen.pack-template": patch
"@palantir/pack.document-schema.type-gen": patch
"@palantir/pack.state.foundry-event": patch
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.react": patch
"@palantir/pack.state.core": patch
"@palantir/pack.state.demo": patch
"@palantir/pack.schema": patch
"@palantir/pack.app": patch
---

Move upgrade forward functions out of the schema/IR into a typed UpgradeFns table that apps supply to the generated DocumentModel(...) factory at boot, eliminating Function.toString() source-splicing and enforcing exhaustive upgrade function coverage at compile time.
