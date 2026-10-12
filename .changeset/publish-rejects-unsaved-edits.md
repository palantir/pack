---
"@palantir/pack.state.foundry": patch
"@palantir/pack.state.foundry-event": patch
---

`createPublishedVersion` now rejects while this client still has edits the server hasn't saved. Before, those edits were left out of the version without warning. Try again once they're saved, which usually takes under a second.
