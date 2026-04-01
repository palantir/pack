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
import { defineMigration } from "../defineMigration.js";
import { defineRecord } from "../defineRecord.js";
import {
  defineSchemaUpdate,
  getSchemaVersionMetadata,
  nextSchema,
  SchemaVersionMetadata,
} from "../defineSchemaUpdate.js";
import * as P from "../primitives.js";
import { assertExactKeys } from "./testTypeUtils.js";

describe("defineSchemaUpdate", () => {
  it("should create a named schema update", () => {
    const update = defineSchemaUpdate("addOpacity", (schema: any) => ({
      Shape: schema.Shape.addField("opacity", P.Optional(P.Double)).build(),
    }));

    expect(update.name).toBe("addOpacity");
    expect(update.migration).toBeInstanceOf(Function);
  });
});

describe("nextSchema", () => {
  const baseSchema = defineMigration({}, () => ({
    Shape: defineRecord("Shape", {
      docs: "A shape",
      fields: {
        left: P.Double,
        right: P.Double,
        color: P.Optional(P.String),
      },
    }),
  }));

  const addColorSplit = defineSchemaUpdate("addColorSplit", (schema: any) => ({
    Shape: schema.Shape
      .addField("fillColor", P.Optional(P.String), {
        derivedFrom: ["color"],
        forward: ({ color }: Record<string, unknown>) => color,
      })
      .addField("strokeColor", P.Optional(P.String), {
        derivedFrom: ["color"],
        forward: ({ color }: Record<string, unknown>) => color,
      })
      .build(),
  }));

  const addOpacity = defineSchemaUpdate("addOpacity", (schema: any) => ({
    Shape: schema.Shape
      .addField("opacity", P.Optional(P.Double), { default: 1.0 })
      .build(),
  }));

  it("should build a versioned schema with version 1", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    expect(v1[SchemaVersionMetadata].version).toBe(1);
    expect(v1.schema.Shape).toBeDefined();
    expect(v1.schema.Shape.fields.left).toEqual({ type: "double" });
    expect(v1.schema.Shape.fields.fillColor).toEqual({
      type: "optional",
      item: { type: "string" },
    });
    expect(v1.schema.Shape.fields.opacity).toEqual({ type: "optional", item: { type: "double" } });
  });

  it("should track schema update entries with stages", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    const meta = v1[SchemaVersionMetadata];
    expect(meta.updates).toHaveLength(2);
    expect(meta.updates[0]).toEqual(
      expect.objectContaining({ name: "addColorSplit", stage: "soak" }),
    );
    expect(meta.updates[1]).toEqual(
      expect.objectContaining({ name: "addOpacity", stage: "finalize" }),
    );
  });

  it("should advance stages across versions", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    const v2 = nextSchema(v1)
      .addSchemaUpdate(addColorSplit, "adopt")
      .build();

    const meta = v2[SchemaVersionMetadata];
    expect(meta.version).toBe(2);

    // addOpacity carried forward at finalize, addColorSplit advanced to adopt
    const opacityEntry = meta.updates.find(u => u.name === "addOpacity");
    const colorEntry = meta.updates.find(u => u.name === "addColorSplit");
    expect(opacityEntry?.stage).toBe("finalize");
    expect(colorEntry?.stage).toBe("adopt");
  });

  it("should implicit carry-forward updates not mentioned", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    // v2 only mentions addColorSplit — addOpacity carries forward
    const v2 = nextSchema(v1)
      .addSchemaUpdate(addColorSplit, "adopt")
      .build();

    const meta = v2[SchemaVersionMetadata];
    expect(meta.updates.find(u => u.name === "addOpacity")).toEqual(
      expect.objectContaining({ name: "addOpacity", stage: "finalize" }),
    );
  });

  it("should maintain version history", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .build();

    const v2 = nextSchema(v1)
      .addSchemaUpdate(addColorSplit, "adopt")
      .build();

    const v3 = nextSchema(v2)
      .addSchemaUpdate(addColorSplit, "finalize")
      .build();

    expect(v3[SchemaVersionMetadata].version).toBe(3);
    expect(v3[SchemaVersionMetadata].history).toHaveLength(2);
    expect(v3[SchemaVersionMetadata].history[0]!.version).toBe(1);
    expect(v3[SchemaVersionMetadata].history[1]!.version).toBe(2);
  });

  it("should error on stage regression", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "adopt")
      .build();

    expect(() => {
      nextSchema(v1).addSchemaUpdate(addColorSplit, "soak");
    }).toThrow(/cannot move from stage "adopt" to "soak"/);
  });

  it("should error on stage repetition", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .build();

    expect(() => {
      nextSchema(v1).addSchemaUpdate(addColorSplit, "soak");
    }).toThrow(/cannot move from stage "soak" to "soak"/);
  });

  it("should error on duplicate update in same version", () => {
    expect(() => {
      nextSchema(baseSchema)
        .addSchemaUpdate(addColorSplit, "soak")
        .addSchemaUpdate(addColorSplit as any, "adopt");
    }).toThrow(/already declared in this schema version/);
  });

  it("should work with a plain schema (no previous versioned metadata)", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    expect(v1[SchemaVersionMetadata].version).toBe(1);
    expect(v1[SchemaVersionMetadata].history).toHaveLength(0);
  });

  it("should support getSchemaVersionMetadata helper", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    expect(getSchemaVersionMetadata(v1)).toBe(v1[SchemaVersionMetadata]);
    expect(getSchemaVersionMetadata(baseSchema)).toBeUndefined();
    expect(getSchemaVersionMetadata(null)).toBeUndefined();
  });

  it("should produce correct field types in the schema", () => {
    const v1 = nextSchema(baseSchema)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    const fields = v1.schema.Shape.fields;
    assertExactKeys<
      typeof fields,
      "left" | "right" | "color" | "fillColor" | "strokeColor" | "opacity"
    >();
  });
});
