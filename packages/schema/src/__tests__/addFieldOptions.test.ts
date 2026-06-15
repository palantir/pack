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
import { applyMigration, defineMigration } from "../defineMigration.js";
import { defineRecord } from "../defineRecord.js";
import { defineSchema, defineSchemaUpdate, nextSchema } from "../defineSchemaUpdate.js";
import { defineUnion } from "../defineUnion.js";
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

  it("propagates derivedFrom to versioned upgrades", () => {
    const colorSplit = defineSchemaUpdate(
      "colorSplit",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .addField("strokeColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .deprecateField("color")
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();

    expect(v2.migrations).toBeDefined();
    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.migrations?.ShapeBox?.strokeColor?.derivedFrom).toEqual(["color"]);
    expect(Object.keys(v2.migrations?.ShapeBox?.fillColor ?? {})).toEqual(["derivedFrom"]);
  });

  it("deprecateField keeps the field and records the deprecation", () => {
    const colorSplit = defineSchemaUpdate(
      "colorSplit",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .deprecateField("color", "use fillColor/strokeColor")
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();
    const shapeBox = v2.models.ShapeBox;
    expect(Object.keys(shapeBox.fields).sort()).toEqual([
      "color",
      "fillColor",
      "x",
      "y",
    ]);
    expect(v2.deprecations?.ShapeBox?.color).toEqual({
      fromVersion: 2,
      message: "use fillColor/strokeColor",
    });
  });

  it("deprecateField without a message records the version only", () => {
    const update = defineSchemaUpdate(
      "deprecateColor",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox.deprecateField("color").build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.deprecations?.ShapeBox?.color).toEqual({ fromVersion: 2 });
    // Field remains present.
    expect((v2.models.ShapeBox.fields as Record<string, unknown>).color).toBeDefined();
  });

  it("explicit withMigrations is merged with addField sugar", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .build(),
    }));

    const v2 = nextSchema(v1)
      .addSchemaUpdate(update)
      .withMigrations({
        ShapeBox: {
          fillColor: {
            derivedFrom: ["color"],
          },
        },
      })
      .build();

    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
  });

  it("withMigrations supplements (does not erase) sugar from a different field", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .addField("opacity", P.Optional(P.Double))
        .build(),
    }));

    const v2 = nextSchema(v1)
      .addSchemaUpdate(update)
      .withMigrations({
        ShapeBox: {
          opacity: {
            derivedFrom: [],
          },
        },
      })
      .build();

    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.migrations?.ShapeBox?.opacity?.derivedFrom).toEqual([]);
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

  it("deprecateField on an existing field does not affect a new field's upgrade option", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .deprecateField("color")
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.deprecations?.ShapeBox?.color).toBeDefined();
  });

  it("subsequent addSchemaUpdate does not re-collect options from the prior step", () => {
    const step1 = defineSchemaUpdate(
      "step1",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const step2 = defineSchemaUpdate(
      "step2",
      (
        schema: SchemaBuilder<
          typeof v1.models & { ShapeBox: typeof v1.models.ShapeBox }
        >,
      ) => ({
        ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(step1).addSchemaUpdate(step2).build();

    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(Object.keys(v2.migrations?.ShapeBox ?? {})).toEqual(["fillColor"]);
    expect((v2.migrations?.ShapeBox as Record<string, unknown> | undefined)?.z).toBeUndefined();
  });

  it("does not propagate sugar across nextSchema boundaries", () => {
    const step1 = defineSchemaUpdate(
      "step1",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(step1).build();
    expect(v2.migrations?.ShapeBox?.fillColor).toBeDefined();

    const step2 = defineSchemaUpdate(
      "step2",
      (schema: SchemaBuilder<typeof v2.models>) => ({
        ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
      }),
    );
    const v3 = nextSchema(v2).addSchemaUpdate(step2).build();

    expect(v3.migrations).toBeUndefined();
  });

  it("a migration that renames a model keys the upgrade by the output name", () => {
    const rename = defineSchemaUpdate(
      "rename",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        // The user reassigns the built def to a different output key.
        Box: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(rename).build();
    expect(v2.migrations?.Box?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.migrations?.ShapeBox).toBeUndefined();
  });

  it("RecordDef carries no symbol-keyed metadata after a migration", () => {
    const { models } = applyMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .build(),
    }));

    expect(Object.getOwnPropertySymbols(models.ShapeBox)).toEqual([]);
    const json = JSON.parse(JSON.stringify(models.ShapeBox)) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["docs", "fields", "name", "type"]);
  });

  it("applyMigration returns undefined upgrades when none are collected", () => {
    const result = applyMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
    }));
    expect(result.upgrades).toBeUndefined();
  });

  it("defineMigration drops upgrade options silently (lower-level entry point)", () => {
    // The public defineMigration returns just T & S; it does not surface
    // upgrades. Callers that need upgrades use applyMigration or addSchemaUpdate.
    const merged = defineMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .build(),
    }));

    expect(merged.ShapeBox.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(Object.getOwnPropertySymbols(merged.ShapeBox)).toEqual([]);
  });

  it("withMigrations silently drops entries for fields the model no longer has", () => {
    const v2 = nextSchema(v1)
      .withMigrations({
        ShapeBox: {
          ghost: {
            derivedFrom: ["color"],
          },
        },
      })
      .build();

    expect(v2.migrations).toBeUndefined();
  });

  it("retyping a record into a union drops the prior step's migrations", () => {
    const Circle = defineRecord("Circle", {
      docs: "circle",
      fields: { radius: P.Double },
    });
    const Square = defineRecord("Square", {
      docs: "square",
      fields: { side: P.Double },
    });

    const addSugar = defineSchemaUpdate(
      "addSugar",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const retype = defineSchemaUpdate(
      "retype",
      (
        _schema: SchemaBuilder<
          typeof v1.models & { ShapeBox: typeof v1.models.ShapeBox }
        >,
      ) => ({
        Circle,
        Square,
        ShapeBox: defineUnion("ShapeBox", {
          docs: "now a union",
          variants: { Circle, Square },
        }),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(addSugar).addSchemaUpdate(retype).build();

    // The merged TS type for the `ShapeBox` key intersects a `RecordDef` with
    // a `UnionDef`, which collapses to `never` at the type level even though
    // the runtime override produces the union. Cast for the runtime check.
    expect((v2.models.ShapeBox as unknown as { type: string }).type).toBe("union");
    expect(v2.migrations).toBeUndefined();
  });
});
