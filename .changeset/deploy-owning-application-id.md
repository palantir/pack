---
"@palantir/pack.document-schema.type-gen": minor
---

Include `owningApplicationId` when deploying a first-party document type via `ir deploy --first-party`. When set in `pack-config.json`, the value now flows through the IR chain payload into the `createFirstParty` request body, matching the existing `ir asset` behavior.
