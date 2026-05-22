---
"@palantir/pack.sdkgen.pack-versioned-template": minor
"@palantir/pack.document-schema.type-gen": minor
---

refactor minimum supported version to be piped from configuration file so IR contains minimum supported version. This will enable downstream consumers to read the same supported version. Asset file with version compatibility range also generated for first party apps.
