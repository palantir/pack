---
"@palantir/pack.state.foundry": minor
"@palantir/pack.state.core": minor
"@palantir/pack.core": minor
"@palantir/pack.app": minor
---

Support multiple-ontology applications via an OSDK client factory.

`initPackApp` now takes a client factory `(ontologyRid: string) => Client` instead of a pre-built
`Client`. The boot client is minted as `factory(defaultOntologyRid)`; clients for other ontologies
are minted on demand (and memoized) when creating documents. PACK always passes a concrete
`ontologyRid` to the factory, so hosts pass it straight through. Pass the target ontology per
document via `CreateDocumentMetadata.ontologyRid`.

BREAKING CHANGES:
- `initPackApp(client, options)` → `initPackApp((ontologyRid) => createClient(url, ontologyRid, auth), options)`.
- `AppConfig.osdkClient` and `AppConfig.createOsdkClientForOntology` are removed; use
  `AppConfig.getClient(ontologyRid?)`.
- `AppConfig.ontologyRid: Promise<string>` is replaced by `AppConfig.defaultOntologyRid: string`
  (resolved synchronously from `options.ontologyRid` ?? the `osdk-ontologyRid` page-env meta tag).
  `initPackApp` now throws at construction if neither is present (previously an eagerly-rejected
  promise surfaced later).
- `AppOptions.ontologyRid` is narrowed from `string | Promise<string>` to `string`; deferred hosts
  resolve it before calling `initPackApp`.
