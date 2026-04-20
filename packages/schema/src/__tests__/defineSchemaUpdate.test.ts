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
import {
  __previousSchema,
  __schemaVersion,
  defineSchemaUpdate,
  nextSchema,
} from "../defineSchemaUpdate.js";
import { defineUnion } from "../defineUnion.js";
import * as P from "../primitives.js";
import { assertExactKeys, assertHasKeys, assertTypeEquals } from "./testTypeUtils.js";

describe("defineSchemaUpdate", () => {
  it("should create a schema update and apply it via nextSchema", () => {
    const schemaV1 = {
      Person: defineRecord("Person", {
        docs: "A person",
        fields: {
          name: P.String,
        },
      }),
    };

    const addAge = defineSchemaUpdate("addAge", (schema: SchemaBuilder<typeof schemaV1>) => ({
      PersonV2: schema.Person.addField("age", P.Double).build(),
    }));

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addAge).build();

    expect(schemaV2.Person).toBe(schemaV1.Person);
    expect(schemaV2.PersonV2.fields.name).toEqual({ type: "string" });
    expect(schemaV2.PersonV2.fields.age).toEqual({ type: "double" });
    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);

    assertHasKeys<typeof schemaV2, "Person" | "PersonV2">();
    assertExactKeys<typeof schemaV2.PersonV2.fields, "name" | "age">();
    assertTypeEquals<typeof schemaV2.PersonV2.fields.name, P.String>();
    assertTypeEquals<typeof schemaV2.PersonV2.fields.age, P.Double>();
  });

  it("should compose multiple schema updates in one version", () => {
    const schemaV1 = {
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
    };

    const addFillColor = defineSchemaUpdate(
      "addFillColor",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
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
      (schema: SchemaBuilder<typeof schemaV1>) => ({
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

    expect(schemaV2.ShapeBox.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV2.ShapeBox.fields.opacity).toEqual({
      type: "optional",
      item: { type: "double" },
    });
    expect(schemaV2.ShapeBox.fields.left).toEqual({ type: "double" });
    expect(schemaV2.ShapeCircle.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV2.ShapeCircle.fields.opacity).toEqual({
      type: "optional",
      item: { type: "double" },
    });
    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);
  });

  it("should track version advancement across multiple nextSchema calls", () => {
    const schemaV1 = {
      Item: defineRecord("Item", {
        docs: "An item",
        fields: {
          name: P.String,
        },
      }),
    };

    const addDescription = defineSchemaUpdate(
      "addDescription",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Item: schema.Item.addField("description", P.Optional(P.String)).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addDescription).build();

    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);

    const addTags = defineSchemaUpdate(
      "addTags",
      (schema: SchemaBuilder<typeof schemaV2>) => ({
        Item: schema.Item.addField("tags", P.Optional(P.String)).build(),
      }),
    );

    const schemaV3 = nextSchema(schemaV2).addSchemaUpdate(addTags).build();

    expect((schemaV3 as Record<symbol, unknown>)[__schemaVersion]).toBe(3);
    expect(schemaV3.Item.fields.name).toEqual({ type: "string" });
    expect(schemaV3.Item.fields.description).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(schemaV3.Item.fields.tags).toEqual({ type: "optional", item: { type: "string" } });
  });

  it("should store __previousSchema reference on built schema", () => {
    const schemaV1 = {
      Node: defineRecord("Node", {
        docs: "A node",
        fields: {
          label: P.String,
        },
      }),
    };

    const addWeight = defineSchemaUpdate(
      "addWeight",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Node: schema.Node.addField("weight", P.Double).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addWeight).build();

    expect((schemaV2 as Record<symbol, unknown>)[__previousSchema]).toBe(schemaV1);
    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);
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

    const schemaV1 = {
      Shape: defineUnion("Shape", {
        docs: "A shape",
        variants: {
          circle: CircleRecord,
          rectangle: RectangleRecord,
        },
      }),
    };

    const addTriangle = defineSchemaUpdate(
      "addTriangle",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Shape: schema.Shape.addVariant("triangle", TriangleRecord).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addTriangle).build();

    expect(schemaV2.Shape.variants.circle).toEqual({
      type: "ref",
      name: "Circle",
      refType: "record",
    });
    expect(schemaV2.Shape.variants.triangle).toEqual({
      type: "ref",
      name: "Triangle",
      refType: "record",
    });
    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);

    assertExactKeys<typeof schemaV2.Shape.variants, "circle" | "rectangle" | "triangle">();
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

    const schemaV1 = {
      Person: PersonRecord,
      Entity: defineUnion("Entity", {
        docs: "An entity",
        variants: {
          person: PersonRecord,
        },
      }),
    };

    const addAge = defineSchemaUpdate(
      "addAge",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        PersonV2: schema.Person.addField("age", P.Double).build(),
      }),
    );

    const addOrgVariant = defineSchemaUpdate(
      "addOrgVariant",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Entity: schema.Entity.addVariant("organization", OrganizationRecord).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addAge)
      .addSchemaUpdate(addOrgVariant)
      .build();

    expect(schemaV2.PersonV2.fields.name).toEqual({ type: "string" });
    expect(schemaV2.PersonV2.fields.age).toEqual({ type: "double" });
    expect(schemaV2.Entity.variants.person).toEqual({
      type: "ref",
      name: "Person",
      refType: "record",
    });
    expect(schemaV2.Entity.variants.organization).toEqual({
      type: "ref",
      name: "Organization",
      refType: "record",
    });

    assertHasKeys<typeof schemaV2, "Person" | "PersonV2" | "Entity">();
    assertExactKeys<typeof schemaV2.PersonV2.fields, "name" | "age">();
    assertExactKeys<typeof schemaV2.Entity.variants, "person" | "organization">();
  });

  it("should not affect enumerable properties with version symbols", () => {
    const schemaV1 = {
      Item: defineRecord("Item", {
        docs: "An item",
        fields: { name: P.String },
      }),
    };

    const addPrice = defineSchemaUpdate(
      "addPrice",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Item: schema.Item.addField("price", P.Double).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addPrice).build();

    // Symbols should not appear in Object.keys
    expect(Object.keys(schemaV2)).toEqual(["Item"]);
  });
});
