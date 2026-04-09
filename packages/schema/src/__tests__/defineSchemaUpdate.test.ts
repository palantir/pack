/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
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
import { __schemaVersion, defineSchemaUpdate, nextSchema } from "../defineSchemaUpdate.js";
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

    const addColorSplit = defineSchemaUpdate(
      "addColorSplit",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build(),
        ShapeCircle: schema.ShapeCircle
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build(),
      }),
    );

    const addOpacity = defineSchemaUpdate(
      "addOpacity",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("opacity", P.Optional(P.Double), { default: 1.0 })
          .build(),
        ShapeCircle: schema.ShapeCircle
          .addField("opacity", P.Optional(P.Double), { default: 1.0 })
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addColorSplit)
      .addSchemaUpdate(addOpacity)
      .build();

    expect(schemaV2.ShapeBox.fields).not.toHaveProperty("color");
    expect(schemaV2.ShapeBox.fields.fillColor).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV2.ShapeBox.fields.opacity).toEqual({ type: "optional", item: { type: "double" } });
    expect(schemaV2.ShapeBox.fields.left).toEqual({ type: "double" });
    expect(schemaV2.ShapeCircle.fields).not.toHaveProperty("color");
    expect(schemaV2.ShapeCircle.fields.fillColor).toEqual({ type: "optional", item: { type: "string" } });
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
        Item: schema.Item.addField("description", P.Optional(P.String), { default: "" }).build(),
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
    expect(schemaV3.Item.fields.description).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV3.Item.fields.tags).toEqual({ type: "optional", item: { type: "string" } });
  });

  it("should implement the canvas demo pattern from the spec", () => {
    const schemaV1 = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          top: P.Double,
          bottom: P.Double,
          color: P.Optional(P.String),
        },
      }),
      ShapeCircle: defineRecord("ShapeCircle", {
        docs: "A circle shape",
        fields: {
          cx: P.Double,
          cy: P.Double,
          radius: P.Double,
          color: P.Optional(P.String),
        },
      }),
    };

    const addColorSplit = defineSchemaUpdate(
      "addColorSplit",
      (schema: SchemaBuilder<typeof schemaV1>) => {
        const ShapeBox = schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .addField("strokeColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build();

        const ShapeCircle = schema.ShapeCircle
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .addField("strokeColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build();

        return { ShapeBox, ShapeCircle };
      },
    );

    const addOpacity = defineSchemaUpdate(
      "addOpacity",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("opacity", P.Optional(P.Double), { default: 1.0 })
          .build(),
        ShapeCircle: schema.ShapeCircle
          .addField("opacity", P.Optional(P.Double), { default: 1.0 })
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addColorSplit)
      .addSchemaUpdate(addOpacity)
      .build();

    // Verify version
    expect((schemaV2 as Record<symbol, unknown>)[__schemaVersion]).toBe(2);

    // ShapeBox should have the split color fields + opacity, no color
    expect(schemaV2.ShapeBox.fields.left).toEqual({ type: "double" });
    expect(schemaV2.ShapeBox.fields.fillColor).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV2.ShapeBox.fields.strokeColor).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV2.ShapeBox.fields.opacity).toEqual({ type: "optional", item: { type: "double" } });
    expect(schemaV2.ShapeBox.fields).not.toHaveProperty("color");

    // ShapeCircle should have the split color fields + opacity, no color
    expect(schemaV2.ShapeCircle.fields.cx).toEqual({ type: "double" });
    expect(schemaV2.ShapeCircle.fields.fillColor).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV2.ShapeCircle.fields.strokeColor).toEqual({ type: "optional", item: { type: "string" } });
    expect(schemaV2.ShapeCircle.fields.opacity).toEqual({ type: "optional", item: { type: "double" } });
    expect(schemaV2.ShapeCircle.fields).not.toHaveProperty("color");
  });
});
