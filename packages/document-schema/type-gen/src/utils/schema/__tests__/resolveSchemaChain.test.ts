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
    const { chain, latestVersion, minVersion } = resolveSchemaChain(v2, 1, {}, 1);

    expect(chain.map(entry => entry.version)).toEqual([1]);
    expect(latestVersion).toBe(1);
    expect(minVersion).toBe(1);
  });

  it("rejects a maxVersion that is not in the chain", () => {
    expect(() => resolveSchemaChain(v2, undefined, {}, 3)).toThrow(
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
});
