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

import type { SchemaBuilder, SchemaDefinition } from "@palantir/pack.schema";
import { defineRecord, defineSchema, defineSchemaUpdate, nextSchema } from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import { generateVersionedZodFromSchema } from "../generateVersionedZodFromSchema.js";

describe("generateVersionedZodFromSchema", () => {
  it("should generate Zod schemas for a single-version schema (v1 only)", () => {
    const schemaV1 = defineSchema({
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
    });

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

  it("should generate per-version Zod schemas for multi-version schemas", () => {
    const schemaV1 = defineSchema({
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          color: P.Optional(P.String),
        },
      }),
    });

    const addFillColor = defineSchemaUpdate(
      "addFillColor",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String))
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addFillColor).build();

    const result = generateVersionedZodFromSchema(schemaV2, 1);

    // Should generate both v1 and v2 Zod schemas
    expect(result.zodSchemas.size).toBe(2);

    // v1 Zod schema
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("export const ShapeBoxSchema_v1 = z.object({");
    expect(zodV1).toContain("color: z.string().optional()");
    expect(zodV1).not.toContain("fillColor");

    // v2 Zod schema
    const zodV2 = result.zodSchemas.get(2)!;
    expect(zodV2).toContain("export const ShapeBoxSchema_v2 = z.object({");
    expect(zodV2).toContain("color: z.string().optional()");
    expect(zodV2).toContain("fillColor: z.string().optional()");
    expect(zodV2).toContain("satisfies ZodType<ShapeBox_v2>");
  });

  it("should generate internal schema with all fields across all versions", () => {
    // Use manual VersionedSchema for field removal scenario
    const v1Models = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          color: P.Optional(P.String),
        },
      }),
    };

    const v2Models = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          fillColor: P.Optional(P.String),
          strokeColor: P.Optional(P.String),
        },
      }),
    };

    const schemaV2: SchemaDefinition = {
      type: "versioned",
      models: v2Models,
      version: 2,
      previous: { type: "initial", models: v1Models },
    };

    const result = generateVersionedZodFromSchema(schemaV2, 1);

    // Internal schema should include ALL fields from ALL versions, all optional
    const internal = result.internalSchema;
    expect(internal).toContain("export const ShapeBoxInternalSchema = z.object({");
    expect(internal).toContain("left: z.number().optional()");
    expect(internal).toContain("right: z.number().optional()");
    expect(internal).toContain("color: z.string().optional()");
    expect(internal).toContain("fillColor: z.string().optional()");
    expect(internal).toContain("strokeColor: z.string().optional()");
    expect(internal).toContain(".passthrough()");
    expect(internal).not.toContain("satisfies");
  });

  it("should respect minSupportedVersion", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "An item",
        fields: {
          name: P.String,
        },
      }),
    });

    const addDescription = defineSchemaUpdate(
      "addDescription",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Item: schema.Item.addField("description", P.Optional(P.String)).build(),
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

  it("should use custom typeImportPathBase", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
        },
      }),
    });

    const result = generateVersionedZodFromSchema(schemaV1, undefined, "../types");
    const zodV1 = result.zodSchemas.get(1)!;
    expect(zodV1).toContain("from \"../types_v1.js\"");
  });
});
