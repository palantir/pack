---
"@palantir/pack.schema": minor
---

`addVariant` and the union builder's `build` now keep the union's `discriminant` and `docs`. Before, both reset the discriminant to `"type"`, so a union with a custom discriminant got an SDK that couldn't read its existing records. `addVariant` now also throws if the variant name already exists, instead of silently replacing it.

Record builders now preserve `docs` through `addField`, `deprecateField`, and `build`, so schema updates retain record documentation in the generated SDK.
