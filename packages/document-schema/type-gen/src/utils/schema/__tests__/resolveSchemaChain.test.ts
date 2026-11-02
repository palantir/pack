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

import * as P from "@palantir/pack.schema";
import { defineRecord, defineSchema, defineSchemaUpdate, nextSchema } from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import type {
  IFieldDef,
  IModelDef,
} from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import {
  collapseChainToMajors,
  resolveSchemaChain,
  stripDeprecatedFieldsForSdk,
  type VersionedIrEntry,
} from "../resolveSchemaChain.js";

/** Index a record model's fields by key for a given chain entry. */
function fieldsByKey(entry: VersionedIrEntry, modelKey: string): Record<string, IFieldDef> {
  const model: IModelDef = entry.ir.models[modelKey]!;
  if (model.type !== "record") throw new Error(`${modelKey} is not a record`);
  return Object.fromEntries(model.record.fields.map(f => [f.key, f]));
}

describe("resolveSchemaChain provenance", () => {
  const v1 = defineSchema({
    ShapeBox: defineRecord("ShapeBox", {
      docs: "A box",
      fields: { left: P.Double, color: P.Optional(P.String) },
    }),
  });

  const colorSplit = defineSchemaUpdate(
    "colorSplit",
    (schema: P.SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), { derivedFrom: ["color"] })
        .addField("strokeColor", P.Optional(P.String), { derivedFrom: ["color"] })
        .deprecateField("color", "use fillColor/strokeColor")
        .build(),
    }),
  );

  const v2 = nextSchema(v1).addSchemaUpdate(colorSplit).build();

  it("derives addedInVersion from first appearance in the chain", () => {
    const { chain } = resolveSchemaChain(v2);
    const v2Fields = fieldsByKey(chain.find(c => c.version === 2)!, "ShapeBox");

    expect(v2Fields.left!.metadata.addedInVersion).toBe(1);
    expect(v2Fields.fillColor!.metadata.addedInVersion).toBe(2);
    expect(v2Fields.strokeColor!.metadata.addedInVersion).toBe(2);
  });

  it("caps the chain at maxVersion", () => {
    const { chain, latestVersion, minVersion } = resolveSchemaChain(v2, 1, {}, {
      major: 1,
      minor: 0,
    });

    expect(chain.map(entry => entry.version)).toEqual([1]);
    expect(latestVersion).toBe(1);
    expect(minVersion).toBe(1);
  });

  it("rejects a maxVersion that is not in the chain", () => {
    expect(() => resolveSchemaChain(v2, undefined, {}, { major: 3, minor: 0 })).toThrow(
      "maxVersion 3 is not in the schema chain",
    );
  });

  it("keeps a deprecated field present and stamps deprecatedFromVersion + message", () => {
    const { chain } = resolveSchemaChain(v2);
    const v2Fields = fieldsByKey(chain.find(c => c.version === 2)!, "ShapeBox");

    expect(v2Fields.color).toBeDefined();
    expect(v2Fields.color!.metadata.addedInVersion).toBe(1);
    expect(v2Fields.color!.metadata.deprecatedFromVersion).toBe(2);
    expect(v2Fields.color!.metadata.deprecatedMessage).toBe("use fillColor/strokeColor");
  });

  it("does not mark the field deprecated in versions before the deprecation", () => {
    const { chain } = resolveSchemaChain(v2);
    const v1Fields = fieldsByKey(chain.find(c => c.version === 1)!, "ShapeBox");

    expect(v1Fields.color).toBeDefined();
    expect(v1Fields.color!.metadata.deprecatedFromVersion ?? undefined).toBeUndefined();
    expect(v1Fields.fillColor).toBeUndefined();
  });

  it("stripDeprecatedFieldsForSdk drops deprecated fields from v>=deprecation only", () => {
    const { chain } = resolveSchemaChain(v2);
    const stripped = stripDeprecatedFieldsForSdk(chain);

    const v1Fields = fieldsByKey(stripped.find(c => c.version === 1)!, "ShapeBox");
    expect(v1Fields.color).toBeDefined();

    const v2Fields = fieldsByKey(stripped.find(c => c.version === 2)!, "ShapeBox");
    expect(v2Fields.color).toBeUndefined();
    expect(v2Fields.fillColor).toBeDefined();

    expect(fieldsByKey(chain.find(c => c.version === 2)!, "ShapeBox").color).toBeDefined();
  });
});

describe("resolveSchemaChain — union provenance", () => {
  const v1 = defineSchema({
    Box: defineRecord("Box", { docs: "", fields: { a: P.Double } }),
    NodeShape: P.defineUnion("NodeShape", {
      docs: "shape",
      variants: { box: defineRecord("Inner", { docs: "", fields: { z: P.Double } }) },
    }),
  });
  const addB = defineSchemaUpdate(
    "addB",
    (schema: P.SchemaBuilder<typeof v1.models>) => ({
      Box: schema.Box.addField("b", P.Optional(P.String)).build(),
    }),
  );
  const v2 = nextSchema(v1).addSchemaUpdate(addB).build();

  it("a v1-defined union stays addedInVersion 1 in every version", () => {
    const { chain } = resolveSchemaChain(v2);
    for (const version of [1, 2]) {
      const union = chain.find(c => c.version === version)!.ir.models.NodeShape!;
      if (union.type !== "union") throw new Error("NodeShape should be a union");
      expect(union.union.metadata.addedInVersion).toBe(1);
    }
  });

  it("records the version of a variant added after the union, and only that variant", () => {
    const Circle = defineRecord("Circle", { docs: "", fields: { radius: P.Double } });
    const Square = defineRecord("Square", { docs: "", fields: { side: P.Double } });
    const shapes = defineSchema({
      Circle,
      Square,
      Shape: P.defineUnion("Shape", { docs: "", variants: { circle: Circle } }),
    });
    const addSquare = nextSchema(shapes)
      .addSchemaUpdate(defineSchemaUpdate("addSquare", schema => ({
        Shape: schema.Shape.addVariant("square", Square).build(),
      })))
      .build();
    const v3 = nextSchema(addSquare).build();

    const { chain } = resolveSchemaChain(v3);
    const unions = chain.map(entry => {
      const model = entry.ir.models.Shape!;
      if (model.type !== "union") throw new Error("Shape should be a union");
      return model.union;
    });

    expect(unions[0]).not.toHaveProperty("variantMetadata");
    expect(unions[1]!.variantMetadata).toEqual({ square: { addedInVersion: 2 } });
    expect(unions[2]!.variantMetadata).toEqual({ square: { addedInVersion: 2 } });
  });
});

describe("resolveSchemaChain minor versions", () => {
  const v1 = defineSchema({
    ShapeBox: defineRecord("ShapeBox", { docs: "A box", fields: { color: P.String } }),
  });
  const v2 = nextSchema(v1)
    .addSchemaUpdate(defineSchemaUpdate("addFill", (schema: P.SchemaBuilder<typeof v1.models>) => ({
      ShapeBox: schema.ShapeBox
        .addField("fillColor", P.Optional(P.String), { derivedFrom: ["color"] })
        .build(),
    })))
    .build();
  const v2_1 = nextSchema(v2, { bump: "minor" })
    .addSchemaUpdate(
      defineSchemaUpdate("addLabel", (schema: P.SchemaBuilder<typeof v2.models>) => ({
        ShapeBox: schema.ShapeBox.addField("label", P.Optional(P.String)).build(),
      })),
    )
    .build();

  it("records the minor version on chain entries and on fields added in a minor version", () => {
    const { chain, latestVersion } = resolveSchemaChain(v2_1);

    expect(chain.map(entry => [entry.version, entry.minorVersion])).toEqual([
      [1, undefined],
      [2, undefined],
      [2, 1],
    ]);
    expect(latestVersion).toBe(2);

    const fields = fieldsByKey(chain[2]!, "ShapeBox");
    expect(fields.label!.metadata).toEqual({ addedInVersion: 2, addedInMinorVersion: 1 });
    expect(fields.fillColor!.metadata).toEqual({ addedInVersion: 2 });
  });

  it("caps the chain at a minor version or at a .0 version", () => {
    expect(resolveSchemaChain(v2_1, undefined, {}, { major: 2, minor: 1 }).chain).toHaveLength(3);
    expect(resolveSchemaChain(v2_1, undefined, {}, { major: 2, minor: 0 }).chain).toHaveLength(2);
    expect(() => resolveSchemaChain(v2_1, undefined, {}, { major: 2, minor: 2 })).toThrow(
      "maxVersion 2.2 is not in the schema chain (available versions: 1, 2, 2.1)",
    );
  });

  it("collapseChainToMajors keeps the last minor's IR and the major's migrations", () => {
    const { chain } = resolveSchemaChain(v2_1);
    const collapsed = collapseChainToMajors(chain);

    expect(collapsed.map(entry => entry.version)).toEqual([1, 2]);
    expect(collapsed[1]!.minorVersion).toBeUndefined();
    expect(fieldsByKey(collapsed[1]!, "ShapeBox").label).toBeDefined();
    expect(collapsed[1]!.migrations).toEqual({
      ShapeBox: { fillColor: { derivedFrom: ["color"] } },
    });
  });
});
