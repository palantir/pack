# @example/todo.schema

Example todo schema

This is a standalone [Palantir PACK](https://github.com/palantir/pack) **schema
package**. It defines a document schema and produces the intermediate
representation (IR) and asset used to deploy a document type and generate a
typed SDK.

## Layout

- `src/schema.mjs` — the schema definition, authored with `@palantir/pack.schema`.
- `pack-config.json` — code-generation config (SDK package name, document type name).
- `scripts/build-sdk.sh` — regenerates a typed SDK from the schema IR.

## Getting started

```bash
npm install
```

## Build the schema IR and asset

```bash
npm run build:ir      # -> build/ir.json
npm run build:asset   # -> build/asset.json
```

## Generate an SDK

`sdk-gen` compiles the schema and runs the SDK generator. By default it writes to
a sibling `../sdk` directory; pass a different path as the first argument (or edit
`scripts/build-sdk.sh`) to target your SDK package.

```bash
npm run sdk-gen              # generates into ../sdk
# or
bash scripts/build-sdk.sh ../packages/sdk
```

## Evolving the schema

Add records to the map passed to `S.defineSchema(...)`, or introduce new versions
with `S.nextSchema(previous).addSchemaUpdate(...)` to migrate existing data.
