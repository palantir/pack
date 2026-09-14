---
sidebar_position: 2
---

# Writing a Schema

A **schema** defines the shape of your documents. You author it in your schema package using the builders from `@palantir/pack.schema`, and the SDK generator turns it into typed, versioned read and write APIs. If your application was created using the `@palantir/pack.create-app` CLI, this will be in `packages/schema/src/schema.mjs`.

## Records and unions

A **record** is a named set of typed fields, defined with [`defineRecord`](/api/schema/functions/defineRecord). Field types come from the primitives on the imported namespace — [`String`](/api/schema/variables/String), [`Double`](/api/schema/variables/Double), [`Boolean`](/api/schema/variables/Boolean), [`Optional`](/api/schema/variables/Optional), [`Array`](/api/schema/variables/Array) — or references to other records and unions.

A **union** is a choice between several record variants, defined with [`defineUnion`](/api/schema/functions/defineUnion).

## Versions

A schema is a **chain of versions**. Version 1 is a single call to [`defineSchema`](/api/schema/functions/defineSchema). Each later version builds on the previous one with [`nextSchema`](/api/schema/functions/nextSchema), composing one or more named [`defineSchemaUpdate`](/api/schema/functions/defineSchemaUpdate) steps.

The module's **default export must be the latest version**. The generator follows the chain back to the minimum supported version, emitting per-version types and the machinery to upgrade older documents.

## Evolving records & unions

A schema update function receives a builder for each existing record and union, and must return any changed or created primitives. Adding new records and unions is done using [`defineRecord`](/api/schema/functions/defineRecord) and [`defineUnion`](/api/schema/functions/defineUnion), as before.

For modifying existing records:

- `.addField(name, type, { derivedFrom })` — add a field. `derivedFrom` indicates which existing fields can be used to derive a new field on an existing document.
- `.deprecateField(name, message)` — mark an existing field as deprecated.
- `.build()` — return the updated record.

**Note:** a field cannot be changed or removed from a record once added, only deprecated. This is to ensure documents written at older versions are always readable by newer clients.

For a modifying existing unions:
- `.addVariant(name, value)` - create a new variant of the union, with a value type a nested record or union.
- `.build()` — return the updated union.

**Note:** a variant cannot be changed or removed from a union once added. This is to ensure documents written at older versions are always readable by newer clients.

## Example

import SchemaExample from "./_schema-example.md";

<SchemaExample />

## API reference

See the full [`@palantir/pack.schema` API reference](/api/schema/) for every builder, primitive, and type.
