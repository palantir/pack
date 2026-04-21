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
import { generateModelMetadataFromSchema } from "../generateModelMetadataFromSchema.js";

describe("generateModelMetadataFromSchema", () => {
  it("should generate models.ts for a single-version schema", () => {
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

    const result = generateModelMetadataFromSchema(schemaV1);

    // Should import model types
    expect(result.modelsFile).toContain(
      "import type { DocumentSchema, RecordModel } from \"@palantir/pack.document-schema.model-types\"",
    );
    expect(result.modelsFile).toContain(
      "import { Metadata } from \"@palantir/pack.document-schema.model-types\"",
    );

    // Should import types and schemas
    expect(result.modelsFile).toContain("import type { ShapeBox } from \"./types.js\"");
    expect(result.modelsFile).toContain("import { ShapeBoxSchema } from \"./schema.js\"");

    // Should generate model constant
    expect(result.modelsFile).toContain(
      "export interface ShapeBoxModel extends RecordModel<ShapeBox, typeof ShapeBoxSchema> {}",
    );
    expect(result.modelsFile).toContain("export const ShapeBoxModel: ShapeBoxModel = {");
    expect(result.modelsFile).toContain("name: \"ShapeBox\"");

    // Should generate DocumentModel with version: 1
    expect(result.modelsFile).toContain("export const DocumentModel = {");
    expect(result.modelsFile).toContain("ShapeBox: ShapeBoxModel");
    expect(result.modelsFile).toContain("version: 1,");
    expect(result.modelsFile).toContain("as const satisfies DocumentSchema;");

    // Single-version should NOT have migrations or minSupportedVersion
    expect(result.modelsFile).not.toContain("minSupportedVersion");
    expect(result.modelsFile).not.toContain("migrations");
  });

  it("should generate models.ts with version metadata for multi-version schema", () => {
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

    const result = generateModelMetadataFromSchema(schemaV2, 1);

    // Should have version: 2 and minSupportedVersion: 1
    expect(result.modelsFile).toContain("version: 2,");
    expect(result.modelsFile).toContain("minSupportedVersion: 1,");

    // Should import and reference migrations
    expect(result.modelsFile).toContain(
      "import { ShapeBoxMigrations } from \"./_internal/migrations.js\"",
    );
    expect(result.modelsFile).toContain("migrations: {");
    expect(result.modelsFile).toContain("ShapeBox: ShapeBoxMigrations,");
  });

  it("should not include minSupportedVersion when it equals latest", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: { name: P.String },
      }),
    });

    const addDesc = defineSchemaUpdate(
      "addDesc",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Item: schema.Item.addField("desc", P.Optional(P.String)).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addDesc).build();

    // Default: minSupportedVersion = latestVersion (2)
    const result = generateModelMetadataFromSchema(schemaV2);

    expect(result.modelsFile).toContain("version: 2,");
    expect(result.modelsFile).not.toContain("minSupportedVersion");
  });

  it("should generate schema manifest with per-version field lists", () => {
    const v1Models = {
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

    const v2Models = {
      ShapeBox: defineRecord("ShapeBox", {
        docs: "A box shape",
        fields: {
          left: P.Double,
          right: P.Double,
          top: P.Double,
          bottom: P.Double,
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

    const result = generateModelMetadataFromSchema(schemaV2, 1);
    const manifest = result.schemaManifest;

    expect(manifest.latestVersion).toBe(2);
    expect(manifest.minSupportedVersion).toBe(1);

    // v1 fields
    expect(manifest.models.ShapeBox!.versions["1"]!.fields).toEqual(
      ["bottom", "color", "left", "right", "top"],
    );

    // v2 fields (color removed, fillColor + strokeColor added)
    expect(manifest.models.ShapeBox!.versions["2"]!.fields).toEqual(
      ["bottom", "fillColor", "left", "right", "strokeColor", "top"],
    );
  });

  it("should handle three-version chains in manifest", () => {
    const v1Models = {
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
          color: P.Optional(P.String),
        },
      }),
    };

    const v2Models = {
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
          hexColor: P.Optional(P.String),
        },
      }),
    };

    const v3Models = {
      Item: defineRecord("Item", {
        docs: "",
        fields: {
          name: P.String,
          hexColor: P.Optional(P.String),
          tags: P.Optional(P.String),
        },
      }),
    };

    const schemaV3: SchemaDefinition = {
      type: "versioned",
      models: v3Models,
      version: 3,
      previous: {
        type: "versioned",
        models: v2Models,
        version: 2,
        previous: { type: "initial", models: v1Models },
      },
    };

    const result = generateModelMetadataFromSchema(schemaV3, 1);

    expect(result.schemaManifest.latestVersion).toBe(3);
    expect(result.schemaManifest.models.Item!.versions["1"]!.fields).toEqual(["color", "name"]);
    expect(result.schemaManifest.models.Item!.versions["2"]!.fields).toEqual(["hexColor", "name"]);
    expect(result.schemaManifest.models.Item!.versions["3"]!.fields).toEqual([
      "hexColor",
      "name",
      "tags",
    ]);

    // models.ts should have version: 3
    expect(result.modelsFile).toContain("version: 3,");
    expect(result.modelsFile).toContain("minSupportedVersion: 1,");
  });

  it("should use custom import paths", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: { name: P.String },
      }),
    });

    const result = generateModelMetadataFromSchema(schemaV1, undefined, {
      typeImportPath: "../types.js",
      schemaImportPath: "../schema.js",
      migrationsImportPath: "../_internal/migrations.js",
    });

    expect(result.modelsFile).toContain("from \"../types.js\"");
    expect(result.modelsFile).toContain("from \"../schema.js\"");
  });
});
