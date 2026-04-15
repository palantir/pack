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
import { generateInternalFromSchema } from "../generateInternalFromSchema.js";

describe("generateInternalFromSchema", () => {
  function buildCanvasDemo() {
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

    return nextSchema(schemaV1)
      .addSchemaUpdate(addColorSplit)
      .addSchemaUpdate(addOpacity)
      .build();
  }

  it("should generate internal types with all fields from all versions", () => {
    const schemaV2 = buildCanvasDemo();
    const result = generateInternalFromSchema(schemaV2);

    // Internal types should include ALL fields from both v1 and v2
    expect(result.internalTypes).toContain("export interface ShapeBox__Internal {");
    expect(result.internalTypes).toContain("readonly bottom: number;");
    expect(result.internalTypes).toContain("readonly left: number;");
    expect(result.internalTypes).toContain("readonly right: number;");
    expect(result.internalTypes).toContain("readonly top: number;");
    // color was removed in v2, so it should be optional
    expect(result.internalTypes).toContain("readonly color?: string;");
    // fillColor, strokeColor, opacity were added in v2, so they should be optional
    expect(result.internalTypes).toContain("readonly fillColor?: string;");
    expect(result.internalTypes).toContain("readonly strokeColor?: string;");
    expect(result.internalTypes).toContain("readonly opacity?: number;");
  });

  it("should generate migration registry with steps", () => {
    const schemaV2 = buildCanvasDemo();
    const result = generateInternalFromSchema(schemaV2);

    // Should import MigrationRegistry
    expect(result.migrations).toContain(
      "import type { MigrationRegistry } from \"@palantir/pack.document-schema.model-types\";",
    );

    // Should define ShapeBoxMigrations
    expect(result.migrations).toContain(
      "export const ShapeBoxMigrations: MigrationRegistry<\"ShapeBox\">",
    );
    expect(result.migrations).toContain("modelName: \"ShapeBox\"");

    // allFields should contain every field
    expect(result.migrations).toContain("bottom: { type: { kind: ");
    expect(result.migrations).toContain("color: { type: { kind: ");
    expect(result.migrations).toContain("fillColor: { type: { kind: ");
    expect(result.migrations).toContain("opacity: { type: { kind: ");

    // opacity should have a default
    expect(result.migrations).toContain("opacity: { type: { kind:");
    expect(result.migrations).toMatch(/opacity:.*default: 1/);

    // Steps should mention fillColor, strokeColor fields
    expect(result.migrations).toContain("addedInVersion: 2");
    expect(result.migrations).toContain("derivedFrom: [\"color\"]");
    expect(result.migrations).toContain("removedFields: [\"color\"]");
  });

  it("should generate internal Zod schemas", () => {
    const schemaV2 = buildCanvasDemo();
    const result = generateInternalFromSchema(schemaV2);

    // Should import zod
    expect(result.internalSchema).toContain("import { z } from \"zod\";");

    // Should define internal schema
    expect(result.internalSchema).toContain("export const ShapeBoxInternalSchema = z.object({");
    expect(result.internalSchema).toContain("bottom: z.number(),");
    expect(result.internalSchema).toContain("left: z.number(),");
    // Optional fields
    expect(result.internalSchema).toContain("color: z.string().optional(),");
    expect(result.internalSchema).toContain("fillColor: z.string().optional(),");
    expect(result.internalSchema).toContain("strokeColor: z.string().optional(),");
    expect(result.internalSchema).toContain("opacity: z.number().optional(),");
    // Passthrough
    expect(result.internalSchema).toContain("}).passthrough();");
  });

  it("should handle single-version schemas (no migrations)", () => {
    const schemaV1 = {
      Item: defineRecord("Item", {
        docs: "An item",
        fields: {
          name: P.String,
          count: P.Double,
        },
      }),
    };

    const result = generateInternalFromSchema(schemaV1);

    // Internal types
    expect(result.internalTypes).toContain("export interface Item__Internal {");
    expect(result.internalTypes).toContain("readonly count: number;");
    expect(result.internalTypes).toContain("readonly name: string;");

    // No migration steps
    expect(result.migrations).toContain("export const ItemMigrations: MigrationRegistry<\"Item\">");
    expect(result.migrations).toContain("steps: [");
    expect(result.migrations).not.toContain("addedInVersion");

    // Internal schema
    expect(result.internalSchema).toContain("export const ItemInternalSchema = z.object({");
    expect(result.internalSchema).toContain("count: z.number(),");
    expect(result.internalSchema).toContain("name: z.string(),");
  });
});
