---
"@palantir/pack.document-schema.type-gen": patch
---

Generated file headers no longer include the type-gen version, so a PACK upgrade only changes generated files whose content changed. The version is now recorded once in a `generatedBy.json` file, written next to each generated SDK's sources and next to the asset files from `ir asset`.
