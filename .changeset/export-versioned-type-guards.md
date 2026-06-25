---
"@palantir/pack.document-schema.type-gen": minor
---

Export union variant type guards as values from the generated versioned SDK `index.ts`.

The versioned generator emits per-variant guard functions (e.g. `isShape_v1Circle`) into `types_vN.ts`, but `index.ts` only re-exported per-version symbols via `export type { ... }`. Since guards are runtime values, the type-only re-export erased them, leaving them unreachable from the package root — unlike the legacy non-versioned generator, whose flat `export *` carried them through.

`generateIndexFromChain` now emits a per-version value export (`export { isFooBar_v1, ... } from "./types_vN.js"`) alongside the existing type-only export, so consumers can narrow a union at runtime without re-deriving the discriminant check. Records-only schemas are unaffected (no guards, no value export).
