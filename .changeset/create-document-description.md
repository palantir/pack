---
"@palantir/pack.state.core": minor
"@palantir/pack.state.demo": minor
"@palantir/pack.state.foundry": minor
---

Allow `app.state.createDocument` callers to set an optional description. Foundry forwards the
description through both the legacy and V2 create endpoints, and the demo service preserves it in
document metadata.
