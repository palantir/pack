---
"@palantir/pack.state.core": patch
---

Fix inverted record-subscription check in `hasSubscriptions`, which reported no subscriptions for records with both change and delete subscribers and ignored invalid-record subscribers.
