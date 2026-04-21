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
import {
  defineRecord,
  defineSchema,
  defineSchemaUpdate,
  defineUnion,
  nextSchema,
} from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import { generateScopeFromSchema } from "../generateScopeFromSchema.js";

describe("generateScopeFromSchema", () => {
  it("should generate versioned doc ref for a single-version schema", () => {
    const schemaV1 = defineSchema({
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          top: P.Double,
        },
      }),
    });

    const result = generateScopeFromSchema(schemaV1);

    // Should extend DocumentRef
    expect(result).toContain(
      "export interface VersionedDocRef_v1 extends DocumentRef<DocumentModel> {",
    );
    expect(result).toContain("readonly version: 1;");

    // Since it's the first version, all models are "changed"
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1)",
    );
    expect(result).toContain(
      "setCollectionRecord(model: typeof ShapeBoxModel, id: RecordId, data: ShapeBox_v1)",
    );

    // Generic fallback
    expect(result).toContain(
      "updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>)",
    );
    expect(result).toContain(
      "setCollectionRecord<M extends Model>(model: M, id: RecordId, data: ModelData<M>)",
    );

    // Single version = no union, just alias
    expect(result).toContain("export type VersionedDocRef = VersionedDocRef_v1;");
    expect(result).not.toContain(" | ");

    // asVersioned identity function
    expect(result).toContain(
      "export function asVersioned(docRef: DocumentRef<DocumentModel>): VersionedDocRef {",
    );
    expect(result).toContain("return docRef as VersionedDocRef;");
  });

  it("should generate versioned doc ref with changed model overloads for multi-version schema", () => {
    const v1Models = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          color: P.Optional(P.String),
        },
      }),
    };

    const v2Models = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "",
        fields: {
          left: P.Double,
          fillColor: P.Optional(P.String),
        },
      }),
    };

    const schemaV2: SchemaDefinition = {
      type: "versioned",
      models: v2Models,
      version: 2,
      previous: { type: "initial", models: v1Models },
    };

    const result = generateScopeFromSchema(schemaV2, 1);

    // Both version interfaces
    expect(result).toContain(
      "export interface VersionedDocRef_v1 extends DocumentRef<DocumentModel> {",
    );
    expect(result).toContain("readonly version: 1;");
    expect(result).toContain(
      "export interface VersionedDocRef_v2 extends DocumentRef<DocumentModel> {",
    );
    expect(result).toContain("readonly version: 2;");

    // v1 has ShapeBox overload (first version, all models are new)
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1)",
    );

    // v2 has ShapeBox overload because fields changed (color -> fillColor)
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v2)",
    );
    expect(result).toContain(
      "setCollectionRecord(model: typeof ShapeBoxModel, id: RecordId, data: ShapeBox_v2)",
    );

    // Union type
    expect(result).toContain(
      "export type VersionedDocRef = VersionedDocRef_v1 | VersionedDocRef_v2;",
    );

    // Imports
    expect(result).toContain("from \"./types_v1.js\"");
    expect(result).toContain("from \"./types_v2.js\"");
    expect(result).toContain("from \"./writeTypes_v1.js\"");
    expect(result).toContain("from \"./writeTypes_v2.js\"");
    expect(result).toContain("from \"./models.js\"");
  });

  it("should generate setCollectionRecord overloads for union models referencing changed records", () => {
    const ShapeBox = defineRecord("ShapeBox", {
      docs: "",
      fields: {
        left: P.Double,
        color: P.Optional(P.String),
      },
    });
    const ShapeCircle = defineRecord("ShapeCircle", {
      docs: "",
      fields: {
        radius: P.Double,
        color: P.Optional(P.String),
      },
    });
    const schemaV1 = defineSchema({
      ShapeBox,
      ShapeCircle,
      NodeShape: defineUnion("NodeShape", {
        docs: "",
        discriminant: "shapeType",
        variants: {
          box: ShapeBox,
          circle: ShapeCircle,
        },
      }),
    });

    const result = generateScopeFromSchema(schemaV1);

    // Union model should have setCollectionRecord overload
    expect(result).toContain(
      "setCollectionRecord(model: typeof NodeShapeModel, id: RecordId, data: NodeShape_v1)",
    );

    // Record model variants should have updateRecord overloads
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1)",
    );
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeCircleModel>, data: ShapeCircleUpdate_v1)",
    );
  });

  it("should generate generic fallback for models with only additive changes", () => {
    const schemaV1 = defineSchema({
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
    });

    // Only change ShapeBox; Label stays the same
    const addColor = defineSchemaUpdate(
      "addColor",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        ShapeBox: schema.ShapeBox
          .addField("color", P.Optional(P.String))
          .build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addColor).build();

    const result = generateScopeFromSchema(schemaV2, 1);

    // v2: ShapeBox changed (gained a field), Label did NOT change
    // ShapeBox should have specific overloads in v2
    expect(result).toContain(
      "updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v2)",
    );

    // Label should NOT have specific overloads in v2 (it didn't change)
    expect(result).not.toContain(
      "updateRecord(ref: RecordRef<typeof LabelModel>, data: LabelUpdate_v2)",
    );

    // Both should be covered by the generic fallback
    expect(result).toContain(
      "updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>)",
    );
  });
});
