---
"@palantir/pack.state.core": patch
---

Add groundwork for reading published document versions: an internal read-only document service that loads a document snapshot, and routing in `app.state` that sends calls made with a ref to the service that owns it. No public API changes.
