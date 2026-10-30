---
"@palantir/pack.app": patch
"@palantir/pack.app.react": patch
"@palantir/pack.auth": patch
"@palantir/pack.auth.foundry": patch
"@palantir/pack.core": patch
"@palantir/pack.document-schema.model-types": patch
"@palantir/pack.schema": patch
"@palantir/pack.state.core": patch
"@palantir/pack.state.demo": patch
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.foundry-event": patch
"@palantir/pack.state.react": patch
---

Fix subpath exports (`"./*"`) so Node loads `build/esm/public/*.js` and `build/cjs/public/*.cjs`. They pointed at `build/js/public/*.js` and `build/cjs/public/*.js`, which the build never writes.
