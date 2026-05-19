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
import type { RecordDef } from "../defs.js";
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
          .removeField("color")
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();

    expect(v2.migrations).toBeDefined();
    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(v2.migrations?.ShapeBox?.strokeColor?.derivedFrom).toEqual(["color"]);
    expect(Object.keys(v2.migrations?.ShapeBox?.fillColor ?? {})).toEqual(["derivedFrom"]);
  });

  it("removeField strips the field from the resulting record fields", () => {
    const colorSplit = defineSchemaUpdate(
      "colorSplit",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
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

  it("AdditiveFieldOptions { default } is accepted but not added to upgrades", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("opacity", P.Optional(P.Double), { default: 1.0 })
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
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

  it("removeField drops any upgrade option staged for that field name", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("temp", P.Optional(P.String), {
          derivedFrom: ["color"],
        })
        .removeField("temp")
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.migrations).toBeUndefined();
    expect((v2.models.ShapeBox.fields as Record<string, unknown>).temp).toBeUndefined();
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

  it("applyMigration filters out AdditiveFieldOptions from upgrades", () => {
    const result = applyMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("opacity", P.Optional(P.Double), { default: 0.5 })
        .build(),
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

  // Type of v1.models after a prior step adds an optional-string `temp` field
  // to ShapeBox. Used to type the input of a later step that calls
  // `removeField("temp")` — without this, `temp` is not statically known to
  // be in the field set and the call would fail to type-check.
  type V1WithTemp = typeof v1.models & {
    ShapeBox: RecordDef<
      typeof v1.models.ShapeBox["fields"] & { readonly temp: P.Optional<P.String> }
    >;
  };

  it("a later addSchemaUpdate that removes a field also drops its migration", () => {
    const addTemp = defineSchemaUpdate(
      "addTemp",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("temp", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const removeTemp = defineSchemaUpdate(
      "removeTemp",
      (schema: SchemaBuilder<V1WithTemp>) => ({
        ShapeBox: schema.ShapeBox.removeField("temp").build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(addTemp).addSchemaUpdate(removeTemp).build();

    expect((v2.models.ShapeBox.fields as Record<string, unknown>).temp).toBeUndefined();
    expect(v2.migrations).toBeUndefined();
  });

  it("a later update may remove one upgraded field while adding another", () => {
    const addTwo = defineSchemaUpdate(
      "addTwo",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("temp", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
          })
          .build(),
      }),
    );

    const removeTemp = defineSchemaUpdate(
      "removeTemp",
      (schema: SchemaBuilder<V1WithTemp>) => ({
        ShapeBox: schema.ShapeBox.removeField("temp").build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(addTwo).addSchemaUpdate(removeTemp).build();

    expect(Object.keys(v2.migrations?.ShapeBox ?? {})).toEqual(["fillColor"]);
    expect((v2.migrations?.ShapeBox as Record<string, unknown> | undefined)?.temp).toBeUndefined();
  });

  it("withMigrations entries are pruned when a later update removes the field", () => {
    const noop = defineSchemaUpdate(
      "noop",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("temp", P.Optional(P.String))
          .build(),
      }),
    );

    const removeTemp = defineSchemaUpdate(
      "removeTemp",
      (schema: SchemaBuilder<V1WithTemp>) => ({
        ShapeBox: schema.ShapeBox.removeField("temp").build(),
      }),
    );

    const v2 = nextSchema(v1)
      .addSchemaUpdate(noop)
      .withMigrations({
        ShapeBox: {
          temp: {
            derivedFrom: ["color"],
          },
        },
      })
      .addSchemaUpdate(removeTemp)
      .build();

    expect((v2.models.ShapeBox.fields as Record<string, unknown>).temp).toBeUndefined();
    expect(v2.migrations).toBeUndefined();
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

  it("UpgradeFieldOptions { derivedFrom, default } captures default in upgrades", () => {
    // When a derived field also supplies a literal-JSON `default`, the option
    // object flows into `upgrades` verbatim — the runtime upgrade function
    // may consult `default` when no source data is present.
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          default: "transparent",
        })
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.migrations?.ShapeBox?.fillColor).toEqual({
      derivedFrom: ["color"],
      default: "transparent",
    });
  });
});

// Exercises `assertJsonDefault` via the public `addField()` entry point.
// `assertJsonDefault` is not exported, so we drive it through the builder.
// Each rejection case asserts both that the call throws and that the path
// reported in the error message includes the field name (and, where
// applicable, a nested key/index) — that path is the user-facing breadcrumb
// when a default value is malformed.
describe("addField default value validation (assertJsonDefault)", () => {
  const v1 = defineSchema({
    R: defineRecord("R", { docs: "r", fields: { x: P.Double } }),
  });

  /**
   * Helper that builds a one-field migration adding `extra` with the given
   * `default`. Returns the `addField` invocation as a thunk so callers can
   * either invoke it (success case) or assert it throws (rejection case).
   */
  function withDefault(value: unknown): () => unknown {
    return () =>
      defineMigration(v1.models, schema => ({
        R: schema.R
          .addField("extra", P.Optional(P.String), { default: value as never })
          .build(),
      }));
  }

  describe("accepts literal JSON", () => {
    it.each([
      ["string", "hello"],
      ["number", 42],
      ["zero", 0],
      ["negative number", -1.5],
      ["true", true],
      ["false", false],
      ["null", null],
      ["empty object", {}],
      ["empty array", []],
      ["nested plain object", { a: 1, b: { c: "x", d: [1, 2, null] } }],
      ["nested array of plain objects", [{ x: 1 }, { x: 2 }]],
    ])("%s", (_label, value) => {
      expect(withDefault(value)).not.toThrow();
    });
  });

  describe("rejects non-JSON values", () => {
    it("undefined at the top level", () => {
      // Note: `{ default: undefined }` is structurally the same as `{}` so
      // it bypasses validation; the real top-level case is `default: NaN`
      // surfacing as undefined-after-stringify. We test undefined-via-nesting
      // below where it actually triggers the validator.
      expect(withDefault(() => undefined)).toThrow(/function is not valid JSON/);
    });

    it("nested undefined inside an object", () => {
      expect(withDefault({ a: 1, b: undefined })).toThrow(
        /addField\("extra"\)\.default\.b: undefined is not valid JSON/,
      );
    });

    it("nested undefined inside an array", () => {
      expect(withDefault([1, undefined, 3])).toThrow(
        /addField\("extra"\)\.default\[1\]: undefined is not valid JSON/,
      );
    });

    it("function", () => {
      expect(withDefault(() => 1)).toThrow(/function is not valid JSON/);
    });

    it("symbol", () => {
      expect(withDefault(Symbol("s"))).toThrow(/symbol is not valid JSON/);
    });

    it("bigint", () => {
      expect(withDefault(BigInt(1))).toThrow(/bigint is not valid JSON/);
    });

    it("Date instance (non-plain object)", () => {
      expect(withDefault(new Date(0))).toThrow(/Date is not valid JSON/);
    });

    it("RegExp instance (non-plain object)", () => {
      expect(withDefault(/foo/)).toThrow(/RegExp is not valid JSON/);
    });

    it("class instance (non-plain object)", () => {
      class Widget {
        readonly id = 1;
      }
      expect(withDefault(new Widget())).toThrow(/Widget is not valid JSON/);
    });

    it("Map (non-plain object)", () => {
      expect(withDefault(new Map())).toThrow(/Map is not valid JSON/);
    });

    it("symbol-keyed property on a plain object", () => {
      const obj: Record<string | symbol, unknown> = { a: 1 };
      obj[Symbol("k")] = 2;
      expect(withDefault(obj)).toThrow(
        /symbol-keyed properties are not valid JSON/,
      );
    });

    it("nested non-plain object reports the path", () => {
      expect(withDefault({ inner: { date: new Date(0) } })).toThrow(
        /addField\("extra"\)\.default\.inner\.date: Date is not valid JSON/,
      );
    });
  });
});
