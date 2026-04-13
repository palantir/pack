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
import { generateScopeFromSchema } from "../generateScopeFromSchema.js";

describe("generateScopeFromSchema", () => {
  it("should generate scope for a single-version schema", () => {
    const schemaV1 = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          top: P.Double,
        },
      }),
    };

    const result = generateScopeFromSchema(schemaV1);

    // Should have DocumentScopeBase
    expect(result).toContain("export interface DocumentScopeBase {");
    expect(result).toContain("readonly version: number;");
    expect(result).toContain("readonly docRef: DocumentRef;");
    expect(result).toContain("withTransaction(fn: () => void, description?: EditDescription): void;");
    expect(result).toContain("deleteRecord<M extends Model>(ref: RecordRef<M>): void;");

    // Single version scope
    expect(result).toContain("export interface DocumentScope_v1 extends DocumentScopeBase {");
    expect(result).toContain("readonly version: 1;");

    // Since it's the first version, all models are "changed"
    expect(result).toContain("updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1): void;");
    expect(result).toContain("setCollectionRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBox_v1): void;");

    // Generic fallback
    expect(result).toContain("updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): void;");
    expect(result).toContain("setCollectionRecord<M extends Model>(ref: RecordRef<M>, data: ModelData<M>): void;");

    // Single version = no union, just alias
    expect(result).toContain("export type DocumentScope = DocumentScope_v1;");
    expect(result).not.toContain(" | ");
  });

  it("should generate scope with changed model overloads for multi-version schema", () => {
    const schemaV1 = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          color: P.Optional(P.String),
        },
      }),
    };

    const addFillColor = defineSchemaUpdate(
      "addFillColor",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("fillColor", P.Optional(P.String), {
            derivedFrom: ["color"],
            forward: ({ color }: { color: string | undefined }) => color,
          })
          .removeField("color")
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addFillColor).build();

    const result = generateScopeFromSchema(schemaV2, 1);

    // Both version scopes
    expect(result).toContain("export interface DocumentScope_v1 extends DocumentScopeBase {");
    expect(result).toContain("readonly version: 1;");
    expect(result).toContain("export interface DocumentScope_v2 extends DocumentScopeBase {");
    expect(result).toContain("readonly version: 2;");

    // v1 has ShapeBox overload (it's the first version, so all models are new)
    expect(result).toContain("updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1): void;");

    // v2 has ShapeBox overload because fields changed (color -> fillColor)
    expect(result).toContain("updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v2): void;");
    expect(result).toContain("setCollectionRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBox_v2): void;");

    // Union type
    expect(result).toContain("export type DocumentScope = DocumentScope_v1 | DocumentScope_v2;");

    // Imports
    expect(result).toContain('from "./types_v1.js"');
    expect(result).toContain('from "./types_v2.js"');
    expect(result).toContain('from "./writeTypes_v1.js"');
    expect(result).toContain('from "./writeTypes_v2.js"');
    expect(result).toContain('from "./models.js"');
  });

  it("should generate generic fallback for models with only additive changes", () => {
    const schemaV1 = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          top: P.Double,
        },
      }),
      Label: defineRecord("Label", {
        docs: "",
        fields: {
          text: P.String,
        },
      }),
    };

    // Only change ShapeBox; Label stays the same
    const addColor = defineSchemaUpdate(
      "addColor",
      (schema: SchemaBuilder<typeof schemaV1>) => ({
        ShapeBox: schema.ShapeBox
          .addField("color", P.Optional(P.String))
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addColor).build();

    const result = generateScopeFromSchema(schemaV2, 1);

    // v2 scope: ShapeBox changed (gained a field), Label did NOT change
    // ShapeBox should have specific overloads in v2
    expect(result).toContain("updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v2): void;");

    // Label should NOT have specific overloads in v2 (it didn't change)
    expect(result).not.toContain("updateRecord(ref: RecordRef<typeof LabelModel>, data: LabelUpdate_v2): void;");

    // But both should be covered by the generic fallback
    expect(result).toContain("updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): void;");
  });
});
