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

## Evolving records

A schema update receives a builder for each record and returns the changed records:

- `.addField(name, type, { derivedFrom })` — add a field. `derivedFrom` indicates which existing fields can be used to derive a new field on an existing document.
- `.deprecateField(name, message)` — mark an existing field as deprecated.
- `.build()` — return the updated record.

## Example

```js
import * as S from "@palantir/pack.schema";

// v1: the initial schema.
const ShapeBox = S.defineRecord("ShapeBox", {
  docs: "A box.",
  fields: {
    top: S.Double,
    left: S.Double,
    color: S.Optional(S.String),
  },
});

const schemaV1 = S.defineSchema({ ShapeBox });

// v2: split `color` into separate fill and stroke colors. `derivedFrom`
// back-fills the new fields when reading v1 documents.
const splitColor = S.defineSchemaUpdate(
  "splitShapeColorIntoFillAndStroke",
  schema => {
    const ShapeBox = schema.ShapeBox
      .addField("fillColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .addField("strokeColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .deprecateField("color", "Use fillColor and strokeColor instead.")
      .build();
    return { ShapeBox };
  },
);

const schemaV2 = S.nextSchema(schemaV1).addSchemaUpdate(splitColor).build();

// The default export is the latest version.
export default schemaV2;
```

## API reference

See the full [`@palantir/pack.schema` API reference](/api/schema/) for every builder, primitive, and type.
