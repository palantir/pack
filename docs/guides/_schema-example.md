```ts
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
