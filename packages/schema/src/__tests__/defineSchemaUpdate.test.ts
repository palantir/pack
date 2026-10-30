/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it } from "vitest";
import type { SchemaBuilder } from "../defineMigration.js";
import { defineRecord } from "../defineRecord.js";
import { defineSchema, defineSchemaUpdate, nextSchema } from "../defineSchemaUpdate.js";
import { defineUnion } from "../defineUnion.js";
import * as P from "../primitives.js";
import { assertExactKeys, assertHasKeys, assertTypeEquals } from "./testTypeUtils.js";

describe("defineSchemaUpdate", () => {
  it("should create a schema update and apply it via nextSchema", () => {
    const schemaV1 = defineSchema({
      Person: defineRecord("Person", {
        docs: "A person",
        fields: {
          name: P.String,
        },
      }),
    });

    const addAge = defineSchemaUpdate(
      "addAge",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        PersonV2: schema.Person.addField("age", P.Double).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addAge).build();

    expect(schemaV2.models.Person).toBe(schemaV1.models.Person);
    expect(schemaV2.models.PersonV2.docs).toBe("A person");
    expect(schemaV2.models.PersonV2.fields.name).toEqual({ type: "string" });
    expect(schemaV2.models.PersonV2.fields.age).toEqual({ type: "double" });
    expect(schemaV2.version).toBe(2);

    assertHasKeys<typeof schemaV2.models, "Person" | "PersonV2">();
    assertExactKeys<typeof schemaV2.models.PersonV2.fields, "name" | "age">();
    assertTypeEquals<typeof schemaV2.models.PersonV2.fields.name, P.String>();
    assertTypeEquals<typeof schemaV2.models.PersonV2.fields.age, P.Double>();
  });

  it("should preserve record documentation through field additions and deprecations", () => {
    const schemaV1 = defineSchema({
      Person: defineRecord("Person", {
        docs: "A person",
        fields: { name: P.String },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(defineSchemaUpdate("addDisplayName", schema => ({
        Person: schema.Person
          .addField("displayName", P.String, { derivedFrom: ["name"] })
          .deprecateField("name", "Use displayName instead.")
          .build(),
      })))
      .build();

    expect(schemaV2.models.Person.docs).toBe("A person");
    expect(schemaV2.models.Person.fields).toEqual({ name: P.String, displayName: P.String });
    expect(schemaV2.migrations?.Person?.displayName).toEqual({ derivedFrom: ["name"] });
    expect(schemaV2.deprecations?.Person?.name).toEqual({
      fromVersion: 2,
      message: "Use displayName instead.",
    });
    expect(schemaV1.models.Person.fields).toEqual({ name: P.String });
  });

  it("should preserve a record when building without changing fields", () => {
    const schemaV1 = defineSchema({
      Person: defineRecord("Person", {
        docs: "A person",
        fields: { name: P.String },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(defineSchemaUpdate("rebuildPerson", schema => ({
        Person: schema.Person.build(),
      })))
      .build();

    expect(schemaV2.models.Person).toEqual(schemaV1.models.Person);
  });

  it("should compose multiple schema updates in one version", () => {
    const schemaV1 = defineSchema({
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          color: P.Optional(P.String),
        },
      }),
      ShapeCircle: defineRecord("ShapeCircle", {
        docs: "A circle shape",
        fields: {
          cx: P.Double,
          radius: P.Double,
          color: P.Optional(P.String),
        },
      }),
    });

    const addFillColor = defineSchemaUpdate(
      "addFillColor",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String))
          .build(),
        ShapeCircle: schema.ShapeCircle
          .addField("fillColor", P.Optional(P.String))
          .build(),
      }),
    );

    const addOpacity = defineSchemaUpdate(
      "addOpacity",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("opacity", P.Optional(P.Double))
          .build(),
        ShapeCircle: schema.ShapeCircle
          .addField("opacity", P.Optional(P.Double))
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addFillColor)
      .addSchemaUpdate(addOpacity)
      .build();

    expect(schemaV2.models.ShapeBox.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV2.models.ShapeBox.fields.opacity).toEqual({
      type: "optional",
      item: { type: "double" },
    });
    expect(schemaV2.models.ShapeBox.fields.left).toEqual({ type: "double" });
    expect(schemaV2.models.ShapeCircle.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV2.models.ShapeCircle.fields.opacity).toEqual({
      type: "optional",
      item: { type: "double" },
    });
    expect(schemaV2.version).toBe(2);
  });

  it("should track version advancement across multiple nextSchema calls", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "An item",
        fields: {
          name: P.String,
        },
      }),
    });

    const addDescription = defineSchemaUpdate(
      "addDescription",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Item: schema.Item.addField("description", P.Optional(P.String)).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addDescription).build();

    expect(schemaV2.version).toBe(2);

    const addTags = defineSchemaUpdate(
      "addTags",
      (schema: SchemaBuilder<typeof schemaV2.models>) => ({
        Item: schema.Item.addField("tags", P.Optional(P.String)).build(),
      }),
    );

    const schemaV3 = nextSchema(schemaV2).addSchemaUpdate(addTags).build();

    expect(schemaV3.version).toBe(3);
    expect(schemaV3.models.Item.docs).toBe("An item");
    expect(schemaV3.models.Item.fields.name).toEqual({ type: "string" });
    expect(schemaV3.models.Item.fields.description).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV3.models.Item.fields.tags).toEqual({
      type: "optional",
      item: { type: "string" },
    });
  });

  it("should build a walkable version chain via .previous", () => {
    const schemaV1 = defineSchema({
      Node: defineRecord("Node", {
        docs: "A node",
        fields: {
          label: P.String,
        },
      }),
    });

    const addWeight = defineSchemaUpdate(
      "addWeight",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Node: schema.Node.addField("weight", P.Double).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addWeight).build();

    // v2 points back to the v1 InitialSchema
    expect(schemaV2.previous).toBe(schemaV1);
    expect(schemaV2.previous.type).toBe("initial");
    expect(schemaV2.version).toBe(2);
  });

  it("should build a multi-step version chain", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "An item",
        fields: { name: P.String },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(
        defineSchemaUpdate(
          "addPrice",
          schema => ({
            Item: schema.Item.addField("price", P.Double).build(),
          }),
        ),
      )
      .build();

    const schemaV3 = nextSchema(schemaV2)
      .addSchemaUpdate(
        defineSchemaUpdate(
          "addTags",
          schema => ({
            Item: schema.Item.addField("tags", P.Optional(P.String)).build(),
          }),
        ),
      )
      .build();

    // Walk the chain: v3 (versioned) -> v2 (versioned) -> v1 (initial)
    expect(schemaV3.version).toBe(3);
    expect(schemaV3.previous).toBe(schemaV2);
    expect(schemaV3.previous.type).toBe("versioned");
    if (schemaV3.previous.type === "versioned") {
      expect(schemaV3.previous.previous).toBe(schemaV1);
      expect(schemaV3.previous.previous.type).toBe("initial");
    }
  });

  it("should discriminate via type field on built schemas", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "An item",
        fields: { name: P.String },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(
        defineSchemaUpdate(
          "addPrice",
          schema => ({
            Item: schema.Item.addField("price", P.Double).build(),
          }),
        ),
      )
      .build();

    expect(schemaV2.type).toBe("versioned");
    expect(schemaV2.previous.type).toBe("initial");
  });

  it("should work with union schema updates", () => {
    const CircleRecord = defineRecord("Circle", {
      docs: "A circle",
      fields: { radius: P.Double },
    });

    const RectangleRecord = defineRecord("Rectangle", {
      docs: "A rectangle",
      fields: { width: P.Double, height: P.Double },
    });

    const TriangleRecord = defineRecord("Triangle", {
      docs: "A triangle",
      fields: { base: P.Double, height: P.Double },
    });

    const schemaV1 = defineSchema({
      Shape: defineUnion("Shape", {
        docs: "A shape",
        variants: {
          circle: CircleRecord,
          rectangle: RectangleRecord,
        },
      }),
    });

    const addTriangle = defineSchemaUpdate(
      "addTriangle",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Shape: schema.Shape.addVariant("triangle", TriangleRecord).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addTriangle).build();

    expect(schemaV2.models.Shape.discriminant).toBe("type");
    expect(schemaV2.models.Shape.docs).toBe("A shape");
    expect(schemaV2.models.Shape.variants.circle).toEqual({
      type: "ref",
      name: "Circle",
      refType: "record",
    });
    expect(schemaV2.models.Shape.variants.triangle).toEqual({
      type: "ref",
      name: "Triangle",
      refType: "record",
    });
    expect(schemaV2.version).toBe(2);

    assertExactKeys<
      typeof schemaV2.models.Shape.variants,
      "circle" | "rectangle" | "triangle"
    >();
  });

  it("should preserve union metadata through chained variant additions", () => {
    const Circle = defineRecord("Circle", {
      docs: "A circle",
      fields: { radius: P.Double },
    });
    const Rectangle = defineRecord("Rectangle", {
      docs: "A rectangle",
      fields: { width: P.Double, height: P.Double },
    });
    const Triangle = defineRecord("Triangle", {
      docs: "A triangle",
      fields: { base: P.Double, height: P.Double },
    });
    const schemaV1 = defineSchema({
      Circle,
      Rectangle,
      Triangle,
      Shape: defineUnion("Shape", {
        discriminant: "kind",
        docs: "A shape",
        variants: { circle: Circle },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(defineSchemaUpdate("addShapes", schema => ({
        Shape: schema.Shape.addVariant("rectangle", Rectangle)
          .addVariant("triangle", Triangle)
          .build(),
      })))
      .build();

    expect(schemaV2.models.Shape).toEqual({
      ...schemaV1.models.Shape,
      variants: {
        circle: { type: "ref", name: "Circle", refType: "record" },
        rectangle: { type: "ref", name: "Rectangle", refType: "record" },
        triangle: { type: "ref", name: "Triangle", refType: "record" },
      },
    });
    expect(schemaV1.models.Shape.variants).toEqual({
      circle: { type: "ref", name: "Circle", refType: "record" },
    });

    const schemaV3 = nextSchema(schemaV2)
      .addSchemaUpdate(defineSchemaUpdate("rebuildShape", schema => ({
        Shape: schema.Shape.build(),
      })))
      .build();

    expect(schemaV3.models.Shape).toEqual(schemaV2.models.Shape);
  });

  it("should preserve a union when building without adding variants", () => {
    const Circle = defineRecord("Circle", {
      docs: "A circle",
      fields: { radius: P.Double },
    });
    const schemaV1 = defineSchema({
      Circle,
      Shape: defineUnion("Shape", {
        discriminant: "kind",
        docs: "A shape",
        variants: { circle: Circle },
      }),
    });

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(defineSchemaUpdate("rebuildShape", schema => ({
        Shape: schema.Shape.build(),
      })))
      .build();

    expect(schemaV2.models.Shape).toEqual(schemaV1.models.Shape);
  });

  it.each(["circle", "rectangle"] as const)("should reject duplicate variant %s", variantName => {
    const Circle = defineRecord("Circle", {
      docs: "A circle",
      fields: { radius: P.Double },
    });
    const Rectangle = defineRecord("Rectangle", {
      docs: "A rectangle",
      fields: { width: P.Double, height: P.Double },
    });
    const schemaV1 = defineSchema({
      Circle,
      Rectangle,
      Shape: defineUnion("Shape", {
        docs: "A shape",
        variants: { circle: Circle },
      }),
    });

    expect(() =>
      nextSchema(schemaV1)
        .addSchemaUpdate(defineSchemaUpdate("addShapes", schema => ({
          Shape: schema.Shape.addVariant("rectangle", Rectangle)
            // @ts-expect-error Existing variant names cannot be added again.
            .addVariant(variantName, Rectangle)
            .build(),
        })))
        .build()
    ).toThrow(`Variant "${variantName}" already exists in union "Shape".`);
    expect(schemaV1.models.Shape.variants).toEqual({
      circle: { type: "ref", name: "Circle", refType: "record" },
    });
  });

  it("should handle mixed record and union updates in one version", () => {
    const PersonRecord = defineRecord("Person", {
      docs: "A person",
      fields: { name: P.String },
    });

    const OrganizationRecord = defineRecord("Organization", {
      docs: "An organization",
      fields: { orgName: P.String },
    });

    const schemaV1 = defineSchema({
      Person: PersonRecord,
      Entity: defineUnion("Entity", {
        docs: "An entity",
        variants: {
          person: PersonRecord,
        },
      }),
    });

    const addAge = defineSchemaUpdate(
      "addAge",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        PersonV2: schema.Person.addField("age", P.Double).build(),
      }),
    );

    const addOrgVariant = defineSchemaUpdate(
      "addOrgVariant",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Entity: schema.Entity.addVariant("organization", OrganizationRecord).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addAge)
      .addSchemaUpdate(addOrgVariant)
      .build();

    expect(schemaV2.models.PersonV2.fields.name).toEqual({ type: "string" });
    expect(schemaV2.models.PersonV2.fields.age).toEqual({ type: "double" });
    expect(schemaV2.models.Entity.variants.person).toEqual({
      type: "ref",
      name: "Person",
      refType: "record",
    });
    expect(schemaV2.models.Entity.variants.organization).toEqual({
      type: "ref",
      name: "Organization",
      refType: "record",
    });

    assertHasKeys<typeof schemaV2.models, "Person" | "PersonV2" | "Entity">();
    assertExactKeys<typeof schemaV2.models.PersonV2.fields, "name" | "age">();
    assertExactKeys<typeof schemaV2.models.Entity.variants, "person" | "organization">();
  });
});

describe("nextSchema minor versions", () => {
  const Box = defineRecord("Box", { docs: "A box", fields: { color: P.String } });
  const Circle = defineRecord("Circle", { docs: "A circle", fields: { radius: P.Double } });
  const schemaV1 = defineSchema({
    Box,
    Circle,
    Shape: defineUnion("Shape", { docs: "A shape", variants: { box: Box } }),
  });

  const addNote = defineSchemaUpdate(
    "addNote",
    (schema: SchemaBuilder<typeof schemaV1.models>) => ({
      Box: schema.Box.addField("note", P.Optional(P.String)).build(),
    }),
  );

  it("should keep the major version and bump the minor version", () => {
    const schemaV1_1 = nextSchema(schemaV1, { bump: "minor" }).addSchemaUpdate(addNote).build();
    const schemaV1_2 = nextSchema(schemaV1_1, { bump: "minor" }).build();

    expect(schemaV1_1.version).toBe(1);
    expect(schemaV1_1.minorVersion).toBe(1);
    expect(schemaV1_1.previous).toBe(schemaV1);
    expect(schemaV1_2.version).toBe(1);
    expect(schemaV1_2.minorVersion).toBe(2);
    expect(schemaV1_2.models.Box.fields.note).toEqual({
      type: "optional",
      item: { type: "string" },
    });
  });

  it("should reset the minor version on the next major version", () => {
    const schemaV1_1 = nextSchema(schemaV1, { bump: "minor" }).addSchemaUpdate(addNote).build();
    const schemaV2 = nextSchema(schemaV1_1).build();

    expect(schemaV2.version).toBe(2);
    expect(schemaV2.minorVersion).toBeUndefined();
    expect("minorVersion" in nextSchema(schemaV1).build()).toBe(false);
  });

  it("should allow new models in a minor version", () => {
    const schemaV1_1 = nextSchema(schemaV1, { bump: "minor" })
      .addSchemaUpdate(defineSchemaUpdate("addLine", () => ({
        Line: defineRecord("Line", { docs: "A line", fields: { length: P.Double } }),
      })))
      .build();

    expect(schemaV1_1.models.Line.fields.length).toEqual({ type: "double" });
  });

  it("should allow a required field in a minor version", () => {
    const schemaV1_1 = nextSchema(schemaV1, { bump: "minor" })
      .addSchemaUpdate(defineSchemaUpdate("addOpacity", schema => ({
        Box: schema.Box.addField("opacity", P.Double).build(),
      })))
      .build();

    expect(schemaV1_1.models.Box.fields.opacity).toEqual({ type: "double" });
  });

  it("should reject derivedFrom in a minor version", () => {
    expect(() =>
      nextSchema(schemaV1, { bump: "minor" })
        .addSchemaUpdate(defineSchemaUpdate("addFillColor", schema => ({
          Box: schema.Box.addField("fillColor", P.Optional(P.String), { derivedFrom: ["color"] })
            .build(),
        })))
        .build()
    ).toThrow("Field \"Box.fillColor\" cannot use derivedFrom in minor version 1.1.");
  });

  it("should reject a deprecation in a minor version", () => {
    expect(() =>
      nextSchema(schemaV1, { bump: "minor" })
        .addSchemaUpdate(defineSchemaUpdate("deprecateColor", schema => ({
          Box: schema.Box.deprecateField("color").build(),
        })))
        .build()
    ).toThrow("Field \"Box.color\" cannot be deprecated in minor version 1.1.");
  });

  it("should allow adding a union variant in a minor version", () => {
    const schemaV1_1 = nextSchema(schemaV1, { bump: "minor" })
      .addSchemaUpdate(defineSchemaUpdate("addCircle", schema => ({
        Shape: schema.Shape.addVariant("circle", Circle).build(),
      })))
      .build();

    expect(Object.keys(schemaV1_1.models.Shape.variants)).toContain("circle");
  });

  it("should reject removing a union variant in a minor version", () => {
    expect(() =>
      nextSchema(schemaV1, { bump: "minor" })
        .addSchemaUpdate(defineSchemaUpdate("replaceBox", () => ({
          Shape: defineUnion("Shape", { docs: "A shape", variants: { circle: Circle } }),
        })))
        .build()
    ).toThrow("Union \"Shape\" cannot remove variants in minor version 1.1: box.");
  });

  it("should keep deprecations from the major version in a minor version", () => {
    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(defineSchemaUpdate("deprecateColor", schema => ({
        Box: schema.Box.deprecateField("color", "Use fillColor.").build(),
      })))
      .build();
    const schemaV2_1 = nextSchema(schemaV2, { bump: "minor" })
      .addSchemaUpdate(defineSchemaUpdate("addNote", schema => ({
        Box: schema.Box.addField("note", P.Optional(P.String)).build(),
      })))
      .build();

    expect(schemaV2_1.deprecations?.Box?.color).toEqual({
      fromVersion: 2,
      message: "Use fillColor.",
    });
  });
});
