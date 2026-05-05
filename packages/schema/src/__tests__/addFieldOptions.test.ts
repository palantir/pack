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
import {
  __fieldUpgradeMeta,
  defineMigration,
  getFieldUpgradeMeta,
  harvestFieldUpgrades,
  stripFieldUpgradeMeta,
} from "../defineMigration.js";
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
          fillColor: {
            derivedFrom: ["color"],
            forward: () => "explicit-default",
          },
        },
      })
      .build();

    expect(v2.migrations?.ShapeBox?.fillColor?.forward({})).toBe("explicit-default");
  });

  it("withMigrations supplements (does not erase) sugar from a different field", () => {
    const update = defineSchemaUpdate("update", (schema: SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: { color?: string }) => color,
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
            forward: () => 1.0,
          },
        },
      })
      .build();

    expect(v2.migrations?.ShapeBox?.fillColor?.forward({ color: "red" })).toBe("red");
    expect(v2.migrations?.ShapeBox?.opacity?.forward({})).toBe(1.0);
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
          forward: ({ color }: { color?: string }) => color,
        })
        .removeField("temp")
        .build(),
    }));

    const v2 = nextSchema(v1).addSchemaUpdate(update).build();
    expect(v2.migrations).toBeUndefined();
    expect((v2.models.ShapeBox.fields as Record<string, unknown>).temp).toBeUndefined();
  });

  it("metadata symbol does not leak through JSON.stringify or enumerable spread", () => {
    const merged = defineMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: { color?: string }) => color,
        })
        .build(),
    }));

    const meta = getFieldUpgradeMeta(merged.ShapeBox);
    expect(meta).toBeDefined();
    expect(meta?.has("fillColor")).toBe(true);

    const enumerableSymbols = Object.getOwnPropertySymbols(merged.ShapeBox)
      .filter(sym => Object.getOwnPropertyDescriptor(merged.ShapeBox, sym)?.enumerable);
    expect(enumerableSymbols).not.toContain(__fieldUpgradeMeta);

    const json = JSON.parse(JSON.stringify(merged.ShapeBox)) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["docs", "fields", "name", "type"]);
  });

  it("stripFieldUpgradeMeta removes the side-channel symbol", () => {
    const merged = defineMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: { color?: string }) => color,
        })
        .build(),
    }));

    expect(getFieldUpgradeMeta(merged.ShapeBox)).toBeDefined();

    const cleaned = stripFieldUpgradeMeta(merged);
    expect(getFieldUpgradeMeta(cleaned.ShapeBox)).toBeUndefined();
    expect(cleaned.ShapeBox.fields).toEqual(merged.ShapeBox.fields);
  });

  it("harvestFieldUpgrades returns undefined when no upgrades are present", () => {
    const merged = defineMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
    }));

    expect(harvestFieldUpgrades(merged)).toBeUndefined();
  });

  it("harvestFieldUpgrades collapses to undefined when only AdditiveFieldOptions are present", () => {
    const merged = defineMigration(v1.models, schema => ({
      ShapeBox: schema.ShapeBox
        .addField("opacity", P.Optional(P.Double), { default: 0.5 })
        .build(),
    }));

    // Side-channel metadata exists for `opacity`, but harvestFieldUpgrades
    // filters out non-Upgrade options, so the resulting map collapses to
    // undefined.
    expect(getFieldUpgradeMeta(merged.ShapeBox)?.has("opacity")).toBe(true);
    expect(harvestFieldUpgrades(merged)).toBeUndefined();
  });

  it("subsequent addSchemaUpdate does not re-harvest options from the prior step", () => {
    const step1 = defineSchemaUpdate(
      "step1",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color?: string }) => color,
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
        // No new sugar — just touching the schema. The prior step's metadata
        // must not bleed into this step's migrations.
        ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(step1).addSchemaUpdate(step2).build();

    // The fillColor migration is recorded exactly once.
    expect(v2.migrations?.ShapeBox?.fillColor?.derivedFrom).toEqual(["color"]);
    expect(Object.keys(v2.migrations?.ShapeBox ?? {})).toEqual(["fillColor"]);
    // The newly added field has no migration (no options were supplied).
    expect((v2.migrations?.ShapeBox as Record<string, unknown> | undefined)?.z).toBeUndefined();
  });

  it("does not propagate sugar across nextSchema boundaries", () => {
    const step1 = defineSchemaUpdate(
      "step1",
      (schema: SchemaBuilder<typeof v1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color?: string }) => color,
          })
          .build(),
      }),
    );

    const v2 = nextSchema(v1).addSchemaUpdate(step1).build();
    expect(v2.migrations?.ShapeBox?.fillColor).toBeDefined();

    // Another version on top of v2 — touching ShapeBox without supplying new
    // upgrade options should produce no migrations for v3.
    const step2 = defineSchemaUpdate(
      "step2",
      (schema: SchemaBuilder<typeof v2.models>) => ({
        ShapeBox: schema.ShapeBox.addField("z", P.Double).build(),
      }),
    );
    const v3 = nextSchema(v2).addSchemaUpdate(step2).build();

    expect(v3.migrations).toBeUndefined();
  });
});
