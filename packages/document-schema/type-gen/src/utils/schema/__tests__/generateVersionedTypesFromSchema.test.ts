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
import { generateVersionedTypesFromSchema } from "../generateVersionedTypesFromSchema.js";

describe("generateVersionedTypesFromSchema", () => {
  it("should generate types for a single-version schema (v1 only)", () => {
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

    const result = generateVersionedTypesFromSchema(schemaV1);

    // Should generate v1 read types
    expect(result.readTypes.size).toBe(1);
    const readV1 = result.readTypes.get(1)!;
    expect(readV1).toContain("export interface ShapeBox_v1 {");
    expect(readV1).toContain("readonly left: number;");
    expect(readV1).toContain("readonly right: number;");
    expect(readV1).toContain("readonly top: number;");
    expect(readV1).toContain("readonly bottom: number;");
    expect(readV1).toContain("readonly color?: string;");

    // Should generate v1 write types
    expect(result.writeTypes.size).toBe(1);
    const writeV1 = result.writeTypes.get(1)!;
    expect(writeV1).toContain("export type ShapeBoxUpdate_v1 = {");
    expect(writeV1).toContain("readonly left?: number;");
    expect(writeV1).toContain("readonly color?: string;");

    // Should generate types.ts re-export
    expect(result.typesReExport).toContain(
      "export type { ShapeBox_v1 as ShapeBox } from \"./types_v1.js\";",
    );
  });

  it("should generate per-version types for the canvas demo pattern", () => {
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

    const result = generateVersionedTypesFromSchema(schemaV2, 1);

    // Should generate both v1 and v2 read types
    expect(result.readTypes.size).toBe(2);

    // v1 read types
    const readV1 = result.readTypes.get(1)!;
    expect(readV1).toContain("export interface ShapeBox_v1 {");
    expect(readV1).toContain("readonly color?: string;");
    expect(readV1).not.toContain("fillColor");
    expect(readV1).not.toContain("strokeColor");
    expect(readV1).not.toContain("opacity");

    // v2 read types
    const readV2 = result.readTypes.get(2)!;
    expect(readV2).toContain("export interface ShapeBox_v2 {");
    expect(readV2).not.toContain("color");
    expect(readV2).toContain("readonly fillColor?: string;");
    expect(readV2).toContain("readonly strokeColor?: string;");
    // opacity has default, so it should be required (not optional)
    expect(readV2).toContain("readonly opacity: number;");
    expect(readV2).not.toContain("readonly opacity?: number;");

    // v1 write types
    const writeV1 = result.writeTypes.get(1)!;
    expect(writeV1).toContain("export type ShapeBoxUpdate_v1 = {");
    expect(writeV1).toContain("readonly color?: string;");

    // v2 write types - all optional
    const writeV2 = result.writeTypes.get(2)!;
    expect(writeV2).toContain("export type ShapeBoxUpdate_v2 = {");
    expect(writeV2).toContain("readonly fillColor?: string;");
    expect(writeV2).toContain("readonly strokeColor?: string;");
    expect(writeV2).toContain("readonly opacity?: number;");

    // types.ts re-exports latest version
    expect(result.typesReExport).toContain(
      "export type { ShapeBox_v2 as ShapeBox } from \"./types_v2.js\";",
    );
  });

  it("should respect minSupportedVersion and only generate from that version", () => {
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
    const result = generateVersionedTypesFromSchema(schemaV2);
    expect(result.readTypes.size).toBe(1);
    expect(result.readTypes.has(2)).toBe(true);
    expect(result.readTypes.has(1)).toBe(false);

    // Generate from v1 onward
    const resultWithV1 = generateVersionedTypesFromSchema(schemaV2, 1);
    expect(resultWithV1.readTypes.size).toBe(2);
    expect(resultWithV1.readTypes.has(1)).toBe(true);
    expect(resultWithV1.readTypes.has(2)).toBe(true);
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

    const result = generateVersionedTypesFromSchema(schemaV3, 1);
    expect(result.readTypes.size).toBe(3);

    // v1: name, color
    const readV1 = result.readTypes.get(1)!;
    expect(readV1).toContain("readonly name: string;");
    expect(readV1).toContain("readonly color?: string;");
    expect(readV1).not.toContain("hexColor");
    expect(readV1).not.toContain("tags");

    // v2: name, hexColor
    const readV2 = result.readTypes.get(2)!;
    expect(readV2).toContain("readonly name: string;");
    expect(readV2).toContain("readonly hexColor?: string;");
    expect(readV2).not.toContain("readonly color");
    expect(readV2).not.toContain("tags");

    // v3: name, hexColor, tags
    const readV3 = result.readTypes.get(3)!;
    expect(readV3).toContain("readonly name: string;");
    expect(readV3).toContain("readonly hexColor?: string;");
    expect(readV3).toContain("readonly tags?: string;");

    // types.ts re-exports v3
    expect(result.typesReExport).toContain(
      "export type { Item_v3 as Item } from \"./types_v3.js\";",
    );
  });

  it("should make fields with defaults required in read types but optional in write types", () => {
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

    const result = generateVersionedTypesFromSchema(schemaV2, 1);

    // In v2 read types, opacity should be required (not optional) because it has a default
    const readV2 = result.readTypes.get(2)!;
    expect(readV2).toContain("readonly opacity: number;");
    expect(readV2).not.toContain("readonly opacity?");

    // In v2 write types, opacity should be optional
    const writeV2 = result.writeTypes.get(2)!;
    expect(writeV2).toContain("readonly opacity?: number;");
  });
});
