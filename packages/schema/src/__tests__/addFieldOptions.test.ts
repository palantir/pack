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
import * as P from "../primitives.js";

describe("addField with upgrade options", () => {
  const v1 = defineSchema({
    ShapeBox: defineRecord("ShapeBox", {
      docs: "A box",
      fields: {
        x: P.Double,
        y: P.Double,
        color: P.Optional(P.String),
      },
    }),
  });

  it("propagates derivedFrom + forward to versioned upgrades", () => {
    const colorSplit = defineSchemaUpdate(
      "colorSplit",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color?: string }) => color,
          })
          .addField("strokeColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color?: string }) => color,
          })
          .removeField("color")
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();

    expect(v2.migrations).toBeDefined();
    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.migrations?.ShapeBox?.strokeColor?.derivedFrom).toEqual(["color"]);

    // Forward callbacks are functions that derive the new value from the old
    const fillForward = v2.migrations?.ShapeBox?.fillColor?.forward;
    expect(typeof fillForward).toBe("function");
    expect(fillForward?.({ color: "red" })).toBe("red");
  });

  it("removeField strips the field from the resulting record fields", () => {
    const colorSplit = defineSchemaUpdate(
      "colorSplit",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color?: string }) => color,
          })
          .removeField("color")
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();
    const shapeBox = v2.models.ShapeBox;
    expect(Object.keys(shapeBox.fields).sort()).toEqual([
      "fillColor",
      "x",
      "y",
    ]);
  });

  it("explicit withMigrations is merged with addField sugar", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: { color?: string }) => color,
        })
        .build(),
    }));

    const v2 = nextSchema(v1)
      .addSchemaUpdate(update)
      .withMigrations({
        ShapeBox: {
          // Explicit override wins for the same field
          fillColor: {
            derivedFrom: ["color"],
            forward: () => "explicit-default",
          },
        },
      })
      .build();

    expect(v2.migrations?.ShapeBox?.fillColor?.forward({})).toBe("explicit-default");
  });

  it("AdditiveFieldOptions { default } is accepted but not added to upgrades", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("opacity", P.Optional(P.Double), { default: 1.0 })
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    // No forward function for opacity → migrations should not be populated for it
    expect(v2.migrations?.ShapeBox?.opacity).toBeUndefined();
  });

  it("addField without options stays sugar-free", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("z", P.Double)
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.migrations).toBeUndefined();
  });
});
