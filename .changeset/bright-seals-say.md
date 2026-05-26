---
"@palantir/pack.sdkgen.pack-versioned-template": minor
"@palantir/pack.document-schema.type-gen": minor
---

Pipe minimum supported schema version from the SDK's pack-config so the IR is the single source of truth. `ir asset` now also emits a sibling `*-schema-compatibility-range.json` file required by the backend to compute operational versions for first-party apps.

- `schema ir` now requires `--config <pack-config.json>`. Its optional `minSupportedVersion` field declares the oldest schema version this SDK supports; omit the field to track latest only.
- `ir gen-types` no longer accepts `--min-version`; the value is read from the IR payload.
- `pack-versioned-template` no longer prompts for `minVersion`; declare `minSupportedVersion` in your pack-config instead.
