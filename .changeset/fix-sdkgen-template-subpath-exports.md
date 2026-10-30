---
"@palantir/pack.sdkgen.demo-template": patch
"@palantir/pack.sdkgen.pack-template": patch
"@palantir/pack.sdkgen.pack-versioned-template": patch
---

Point the `"./*"` entry in each sdkgen template's `exports` at `build/esm/public/*.js` and `build/cjs/public/*.cjs`, matching the other PACK packages. It pointed at `build/js/public/*.js` and `build/cjs/public/*.js`, which the build never writes.
