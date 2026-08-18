---
"@palantir/pack.document-schema.type-gen": minor
---

`ir deploy --first-party` now publishes to the first-party document type API directly (internal-only), instead of the deprecated `createFirstPartyDocumentType` OSDK endpoint.

This is a **dev-mode** workflow: the schema is recorded unversioned (version `-1`), no RID is minted, and the per-ontology instance is created lazily on first document creation. Re-run with the same document type name to iterate on the schema freely — versioning and backwards-compatibility only apply once the type graduates to a real version via an asset deploy.

**Caller migration:** first-party deploys now require `--first-party-api-url` (your stack's first-party document type REST API base URL; installation-dependent). The previous `--first-party-prefix` and `--ontology-rid` options are accepted but ignored with a warning, so scripts that set `--first-party-prefix` must switch to `--first-party-api-url`.
