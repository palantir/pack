---
"@palantir/pack.document-schema.type-gen": minor
"@palantir/pack.create-app": patch
---

Add `--force-overwrite` to `ir asset`. When set, the generated document type asset carries
`forceOverwrite: true`, telling the platform to skip incremental schema validation when it
processes the asset — the asset-track counterpart to `ir update-schema --force-overwrite`.
The generated workspace app's root `build:asset` script now forwards extra args to the schema
package so the flag reaches the underlying `ir asset` invocation.
