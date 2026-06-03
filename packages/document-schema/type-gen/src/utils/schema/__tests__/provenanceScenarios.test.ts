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

import { defineRecord, defineSchema, defineSchemaUpdate, nextSchema } from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import type {
  IFieldDef,
  IModelDef,
} from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { generateInternalFromChain } from "../generateInternalFromSchema.js";
import {
  resolveSchemaChain,
  stripDeprecatedFieldsForSdk,
  type VersionedIrEntry,
} from "../resolveSchemaChain.js";

function entry(chain: VersionedIrEntry[], v: number): VersionedIrEntry {
  return chain.find(c => c.version === v)!;
}
function recordFields(e: VersionedIrEntry, key: string): Record<string, IFieldDef> {
  const m: IModelDef = e.ir.models[key]!;
  if (m.type !== "record") throw new Error(`${key} not a record`);
  return Object.fromEntries(m.record.fields.map(f => [f.key, f]));
}
function unionMeta(e: VersionedIrEntry, key: string) {
  const m: IModelDef = e.ir.models[key]!;
  if (m.type !== "union") throw new Error(`${key} not a union`);
  return m.union.metadata;
}

describe("provenance — scenarios beyond the demo", () => {
  // v1: Box(a) + one v1 union.
  const v1 = defineSchema({
    Box: defineRecord("Box", { docs: "", fields: { a: P.Double } }),
    OldUnion: P.defineUnion("OldUnion", {
      docs: "",
      variants: { box: defineRecord("UVariant", { docs: "", fields: { z: P.Double } }) },
    }),
  });

  // v2: add a NEW record (Circle) AND a NEW union (NewUnion); add field b to Box.
  const v2update = defineSchemaUpdate("v2", (s: P.SchemaBuilder<typeof v1.models>) => {
    const Box = s.Box.addField("b", P.Optional(P.String)).build();
    const Circle = defineRecord("Circle", { docs: "", fields: { r: P.Double } });
    const NewUnion = P.defineUnion("NewUnion", {
      docs: "",
      variants: { c: Circle },
    });
    return { Box, Circle, NewUnion };
  });
  const v2 = nextSchema(v1).addSchemaUpdate(v2update).build();

  // v3: add field c to Box (3 hops from v1).
  const v3update = defineSchemaUpdate("v3", (s: P.SchemaBuilder<typeof v2.models>) => ({
    Box: s.Box.addField("c", P.Optional(P.Double)).build(),
  }));
  const v3 = nextSchema(v2).addSchemaUpdate(v3update).build();

  it("union defined in v1 stays addedInVersion 1 in every version", () => {
    const { chain } = resolveSchemaChain(v3);
    for (const v of [1, 2, 3]) {
      expect(unionMeta(entry(chain, v), "OldUnion").addedInVersion).toBe(1);
    }
  });

  it("union added in v2 gets addedInVersion 2", () => {
    const { chain } = resolveSchemaChain(v3);
    // not present in v1
    expect(entry(chain, 1).ir.models.NewUnion).toBeUndefined();
    // present in v2 and v3, stamped 2 in both
    expect(unionMeta(entry(chain, 2), "NewUnion").addedInVersion).toBe(2);
    expect(unionMeta(entry(chain, 3), "NewUnion").addedInVersion).toBe(2);
  });

  it("record added in v2 gets its fields stamped addedInVersion 2", () => {
    const { chain } = resolveSchemaChain(v3);
    expect(entry(chain, 1).ir.models.Circle).toBeUndefined();
    expect(recordFields(entry(chain, 2), "Circle").r!.metadata.addedInVersion).toBe(2);
    expect(recordFields(entry(chain, 3), "Circle").r!.metadata.addedInVersion).toBe(2);
  });

  it("field added in v3 to a v1 record gets addedInVersion 3; older fields keep theirs", () => {
    const { chain } = resolveSchemaChain(v3);
    const f = recordFields(entry(chain, 3), "Box");
    expect(f.a!.metadata.addedInVersion).toBe(1); // since v1
    expect(f.b!.metadata.addedInVersion).toBe(2); // added v2
    expect(f.c!.metadata.addedInVersion).toBe(3); // added v3
  });

  it("hand-built schema provenance is derived from first appearance in the chain", () => {
    // Simulate a SchemaDefinition produced without the DSL builder.
    const hand: P.SchemaDefinition = {
      type: "versioned",
      version: 2,
      previous: { type: "initial", version: 1, models: v1.models },
      models: { Box: defineRecord("Box", { docs: "", fields: { a: P.Double, b: P.Double } }) },
    };
    const { chain } = resolveSchemaChain(hand);
    expect(recordFields(entry(chain, 2), "Box").a!.metadata.addedInVersion).toBe(1);
    expect(recordFields(entry(chain, 2), "Box").b!.metadata.addedInVersion).toBe(2);
    expect(recordFields(entry(chain, 1), "Box").a!.metadata.addedInVersion).toBe(1);
  });

  it("upgrade lens still records removedFields + derivedFrom for a deprecated field", () => {
    // Box: color in v1, split to fillColor/strokeColor + deprecate in v2.
    const b1 = defineSchema({
      Box: defineRecord("Box", { docs: "", fields: { a: P.Double, color: P.Optional(P.String) } }),
    });
    const split = defineSchemaUpdate("split", (s: P.SchemaBuilder<typeof b1.models>) => ({
      Box: s.Box
        .addField("fillColor", P.Optional(P.String), { derivedFrom: ["color"] })
        .deprecateField("color")
        .build(),
    }));
    const b2 = nextSchema(b1).addSchemaUpdate(split).build();

    // The SDK path strips deprecated fields BEFORE generating internals (exactly
    // as irGenTypesHandler does). That strip is what turns "color deprecated in
    // v2" into "color removed at v2" for the upgrade lens.
    const resolved = resolveSchemaChain(b2);
    const stripped = { ...resolved, chain: stripDeprecatedFieldsForSdk(resolved.chain) };
    const internal = generateInternalFromChain(stripped);
    expect(internal.upgrades).toContain("removedFields: [\"color\"]");
    expect(internal.upgrades).toContain("derivedFrom: [\"color\"]");
  });

  it("deprecation with and without message both serialize (spread fix #5)", () => {
    const b1 = defineSchema({
      Box: defineRecord("Box", {
        docs: "",
        fields: { x: P.Optional(P.String), y: P.Optional(P.String) },
      }),
    });
    const dep = defineSchemaUpdate("dep", (s: P.SchemaBuilder<typeof b1.models>) => ({
      Box: s.Box.deprecateField("x", "gone").deprecateField("y").build(),
    }));
    const b2 = nextSchema(b1).addSchemaUpdate(dep).build();
    const f = recordFields(entry(resolveSchemaChain(b2).chain, 2), "Box");
    expect(f.x!.metadata.deprecatedFromVersion).toBe(2);
    expect(f.x!.metadata.deprecatedMessage).toBe("gone");
    expect(f.y!.metadata.deprecatedFromVersion).toBe(2);
    expect(f.y!.metadata.deprecatedMessage ?? undefined).toBeUndefined();
  });
});
