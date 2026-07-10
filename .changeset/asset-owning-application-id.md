---
"@palantir/pack.document-schema.type-gen": minor
---

Include `owningApplicationId` in the generated document type asset. When set in `pack-config.json`, the value flows through `schema ir` into the IR chain payload and `ir asset` writes it onto the `DocumentTypeAsset`.
