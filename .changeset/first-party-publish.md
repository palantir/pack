---
"@palantir/pack.document-schema.type-gen": minor
---

`ir deploy --first-party` now publishes via Backpack's `publishFirstPartyDocumentType` (called directly, internal-only) instead of the deprecated `createFirstPartyDocumentType` OSDK endpoint. Types are recorded as unversioned dev-mode types (no `ontologyRid`/`version`, no RID returned).

**Caller migration:** first-party deploys now require `--backpack-api-url` — your stack's Backpack REST base URL (installation-dependent; commonly `<base-url>/backpack/api`). The previous `--first-party-prefix` and `--ontology-rid` options are accepted but ignored with a warning, so scripts that set `--first-party-prefix` must switch to `--backpack-api-url`.
