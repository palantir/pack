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

import type { SchemaBuilder } from "@palantir/pack.schema";
import { defineRecord, defineSchemaUpdate, nextSchema } from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import { generateVersionedZodFromSchema } from "../generateVersionedZodFromSchema.js";

describe("generateVersionedZodFromSchema", () => {
  it("should generate Zod schemas for a single-version schema (v1 only)", () => {
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
    };

    const result = generateVersionedZodFromSchema(schemaV1);

    // Should generate v1 Zod schema
    expect(result.zodSchemas.size).toBe(1);
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("export const ShapeBoxSchema_v1 = z.object({");
    expect(zodV1).toContain("left: z.number()");
    expect(zodV1).toContain("right: z.number()");
    expect(zodV1).toContain("top: z.number()");
    expect(zodV1).toContain("bottom: z.number()");
    expect(zodV1).toContain("color: z.string().optional()");
    expect(zodV1).not.toContain(".passthrough()");
    expect(zodV1).toContain("satisfies ZodType<ShapeBox_v1>");

    // Should have imports
    expect(zodV1).toContain("import type { ZodType } from \"zod\"");
    expect(zodV1).toContain("import { z } from \"zod\"");
    expect(zodV1).toContain("import type { ShapeBox_v1 }");

    // Should generate schema re-export
    expect(result.schemaReExport).toContain(
      "export { ShapeBoxSchema_v1 as ShapeBoxSchema } from \"./schema_v1.js\";",
    );
  });

  it("should generate per-version Zod schemas for the canvas demo pattern", () => {
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
    };

    const addColorSplit = defineSchemaUpdate(
      "addColorSplit",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .addField("strokeColor", P.Optional(P.String), {
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
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addColorSplit)
      .addSchemaUpdate(addOpacity)
      .build();

    const result = generateVersionedZodFromSchema(schemaV2, 1);

    // Should generate both v1 and v2 Zod schemas
    expect(result.zodSchemas.size).toBe(2);

    // v1 Zod schema
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("export const ShapeBoxSchema_v1 = z.object({");
    expect(zodV1).toContain("color: z.string().optional()");
    expect(zodV1).not.toContain(".passthrough()");
    expect(zodV1).not.toContain("fillColor");
    expect(zodV1).not.toContain("strokeColor");
    expect(zodV1).not.toContain("opacity");

    // v2 Zod schema
    const zodV2 = result.zodSchemas.get(2)!;
    expect(zodV2).toContain("export const ShapeBoxSchema_v2 = z.object({");
    expect(zodV2).not.toContain("color");
    expect(zodV2).toContain("fillColor: z.string().optional()");
    expect(zodV2).toContain("strokeColor: z.string().optional()");
    // opacity has default so it should be required (not optional) in Zod
    expect(zodV2).toContain("opacity: z.number()");
    expect(zodV2).not.toContain("opacity: z.number().optional()");
    expect(zodV2).not.toContain(".passthrough()");
    expect(zodV2).toContain("satisfies ZodType<ShapeBox_v2>");

    // Schema re-export should point to latest
    expect(result.schemaReExport).toContain(
      "export { ShapeBoxSchema_v2 as ShapeBoxSchema } from \"./schema_v2.js\";",
    );
  });

  it("should generate internal schema with all fields across all versions", () => {
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
    };

    const addColorSplit = defineSchemaUpdate(
      "addColorSplit",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .addField("strokeColor", P.Optional(P.String), {
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
      }),
    );

    const schemaV2 = nextSchema(schemaV1)
      .addSchemaUpdate(addColorSplit)
      .addSchemaUpdate(addOpacity)
      .build();

    const result = generateVersionedZodFromSchema(schemaV2, 1);

    // Internal schema should include ALL fields from ALL versions, all optional
    const internal = result.internalSchema;
    expect(internal).toContain("export const ShapeBoxInternalSchema = z.object({");
    expect(internal).toContain("left: z.number().optional()");
    expect(internal).toContain("right: z.number().optional()");
    expect(internal).toContain("top: z.number().optional()");
    expect(internal).toContain("bottom: z.number().optional()");
    expect(internal).toContain("color: z.string().optional()");
    expect(internal).toContain("fillColor: z.string().optional()");
    expect(internal).toContain("strokeColor: z.string().optional()");
    expect(internal).toContain("opacity: z.number().optional()");
    expect(internal).toContain(".passthrough()");
    // Internal schema should NOT have satisfies clause
    expect(internal).not.toContain("satisfies");
  });

  it("should respect minSupportedVersion", () => {
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

    // Only generate from v2 (default: latest only)
    const result = generateVersionedZodFromSchema(schemaV2);
    expect(result.zodSchemas.size).toBe(1);
    expect(result.zodSchemas.has(2)).toBe(true);
    expect(result.zodSchemas.has(1)).toBe(false);

    // Generate from v1 onward
    const resultWithV1 = generateVersionedZodFromSchema(schemaV2, 1);
    expect(resultWithV1.zodSchemas.size).toBe(2);
    expect(resultWithV1.zodSchemas.has(1)).toBe(true);
    expect(resultWithV1.zodSchemas.has(2)).toBe(true);
  });

  it("should handle three-version chains", () => {
    const schemaV1 = {
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
          color: P.Optional(P.String),
        },
      }),
    };

    const renameColor = defineSchemaUpdate(
      "renameColor",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Item: schema.Item
          .addField("hexColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(renameColor).build();

    const addTags = defineSchemaUpdate(
      "addTags",
      (schema: SchemaBuilder<typeof schemaV2>) => ({
        Item: schema.Item.addField("tags", P.Optional(P.String)).build(),
      }),
    );

    const schemaV3 = nextSchema(schemaV2).addSchemaUpdate(addTags).build();

    const result = generateVersionedZodFromSchema(schemaV3, 1);
    expect(result.zodSchemas.size).toBe(3);

    // v1: name, color
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("name: z.string()");
    expect(zodV1).toContain("color: z.string().optional()");
    expect(zodV1).not.toContain("hexColor");
    expect(zodV1).not.toContain("tags");

    // v2: name, hexColor
    const zodV2 = result.zodSchemas.get(2)!;
    expect(zodV2).toContain("name: z.string()");
    expect(zodV2).toContain("hexColor: z.string().optional()");
    expect(zodV2).not.toContain("color");
    expect(zodV2).not.toContain("tags");

    // v3: name, hexColor, tags
    const zodV3 = result.zodSchemas.get(3)!;
    expect(zodV3).toContain("name: z.string()");
    expect(zodV3).toContain("hexColor: z.string().optional()");
    expect(zodV3).toContain("tags: z.string().optional()");

    // Re-export points to v3
    expect(result.schemaReExport).toContain(
      "export { ItemSchema_v3 as ItemSchema } from \"./schema_v3.js\";",
    );
  });

  it("should make fields with defaults required in Zod schemas", () => {
    const schemaV1 = {
      Shape: defineRecord("Shape", {
        docs: "",
        fields: {
          x: P.Double,
        },
      }),
    };

    const addOpacity = defineSchemaUpdate(
      "addOpacity",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        Shape: schema.Shape
          .addField("opacity", P.Optional(P.Double), { default: 1.0 })
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addOpacity).build();

    const result = generateVersionedZodFromSchema(schemaV2, 1);

    // In v2, opacity should be required (not optional) because it has a default
    const zodV2 = result.zodSchemas.get(2)!;
    expect(zodV2).toContain("opacity: z.number()");
    expect(zodV2).not.toContain("opacity: z.number().optional()");
  });

  it("should use custom typeImportPathBase", () => {
    const schemaV1 = {
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
        },
      }),
    };

    const result = generateVersionedZodFromSchema(schemaV1, undefined, "../types");
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("from \"../types_v1.js\"");
  });
});
