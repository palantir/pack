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

import type { SchemaDefinition } from "@palantir/pack.schema";
import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import { resolveSchemaChain } from "./resolveSchemaChain.js";
import type { RuntimeSchemaRecord, SchemaField } from "./runtimeSchema.js";
import { isRecordSchema, isUnionSchema, modelName, schemaName } from "./runtimeSchema.js";

export interface ModelMetadataOutput {
  /** models.ts content -- DocumentModel with version metadata and migration references */
  modelsFile: string;
  /** Schema manifest JSON for backend consumption */
  schemaManifest: SchemaManifest;
}

export interface SchemaManifest {
  latestVersion: number;
  minSupportedVersion: number;
  models: Record<string, {
    versions: Record<string, { fields: string[] }>;
  }>;
}

/**
 * Detect which external ref field types (docRef, mediaRef, objectRef, userRef)
 * are present on a record for its model metadata.
 */
function findExternalRefType(field: SchemaField): string | undefined {
  switch (field.type) {
    case "docRef":
      return "docRef";
    case "mediaRef":
      return "mediaRef";
    case "objectRef":
      return "objectRef";
    case "userRef":
      return "userRef";
    case "optional":
      return field.item ? findExternalRefType(field.item) : undefined;
    case "array":
      return field.items ? findExternalRefType(field.items) : undefined;
    default:
      return undefined;
  }
}

function extractExternalRefFieldTypes(
  record: RuntimeSchemaRecord,
): Array<[string, string]> {
  const refs: Array<[string, string]> = [];
  for (const [fieldName, fieldType] of Object.entries(record.fields)) {
    const refType = findExternalRefType(fieldType);
    if (refType != null) {
      refs.push([fieldName, refType]);
    }
  }
  return refs;
}

/**
 * Generate models.ts and schema manifest from a versioned schema chain.
 *
 * @param schema - The schema definition (initial or versioned)
 * @param minSupportedVersion - Minimum version this client supports (defaults to latest)
 * @param options - Configuration for import paths
 * @returns Object containing generated models.ts content and schema manifest JSON
 */
export function generateModelMetadataFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
  options?: {
    typeImportPath?: string;
    schemaImportPath?: string;
    migrationsImportPath?: string;
  },
): ModelMetadataOutput {
  const { chain, latestVersion, minVersion } = resolveSchemaChain(schema, minSupportedVersion);
  const latestSchema = chain[chain.length - 1]!.schema;

  const typeImportPath = options?.typeImportPath ?? "./types.js";
  const schemaImportPath = options?.schemaImportPath ?? "./schema.js";
  const migrationsImportPath = options?.migrationsImportPath ?? "./_internal/migrations.js";

  // --- Generate models.ts ---
  let output = GENERATED_FILE_HEADER;

  // Collect model names for imports
  const recordNames: string[] = [];
  const unionNames: string[] = [];
  const variantNames: string[] = [];

  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (isRecordSchema(item)) {
      recordNames.push(exportName);
    } else if (isUnionSchema(item)) {
      unionNames.push(exportName);
      for (const variantName of Object.keys(item.variants)) {
        variantNames.push(`${exportName}${formatVariantName(variantName)}`);
      }
    }
  }

  const allModelNames = [...recordNames, ...unionNames, ...variantNames].sort();

  // Imports
  const modelTypesImports: string[] = ["DocumentSchema"];
  if (recordNames.length > 0) modelTypesImports.push("RecordModel");
  if (unionNames.length > 0) modelTypesImports.push("UnionModel");

  output += `import type { ${
    modelTypesImports.sort().join(", ")
  } } from "@palantir/pack.document-schema.model-types";\n`;
  output += `import { Metadata } from "@palantir/pack.document-schema.model-types";\n`;

  if (allModelNames.length > 0) {
    output += `import type { ${allModelNames.join(", ")} } from "${typeImportPath}";\n`;
  }

  // Schema imports
  const schemaNames = allModelNames.map(n => schemaName(n));
  if (schemaNames.length > 0) {
    output += `import { ${schemaNames.join(", ")} } from "${schemaImportPath}";\n`;
  }

  // Migration imports (only if there are migrations)
  const migrationNames = [...recordNames, ...unionNames].map(n => `${n}Migrations`);
  if (chain.length > 1 && migrationNames.length > 0) {
    output += `import { ${migrationNames.join(", ")} } from "${migrationsImportPath}";\n`;
  }

  output += "\n";

  // Generate model constants
  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (isRecordSchema(item)) {
      const externalRefs = extractExternalRefFieldTypes(item);
      const metadataFields: string[] = [];

      if (externalRefs.length > 0) {
        const entries = externalRefs.map(([field, type]) => `      ${field}: "${type}",`).join(
          "\n",
        );
        metadataFields.push(`    externalRefFieldTypes: {\n${entries}\n    },`);
      }
      metadataFields.push(`    name: "${exportName}",`);

      output += `export interface ${
        modelName(exportName)
      } extends RecordModel<${exportName}, typeof ${schemaName(exportName)}> {}\n`;
      output += `export const ${modelName(exportName)}: ${modelName(exportName)} = {\n`;
      output += `  __type: {} as ${exportName},\n`;
      output += `  zodSchema: ${schemaName(exportName)},\n`;
      output += `  [Metadata]: {\n${metadataFields.join("\n")}\n  },\n`;
      output += `};\n\n`;
    } else if (isUnionSchema(item)) {
      const metadataFields: string[] = [];
      metadataFields.push(`    discriminant: "${item.discriminant}",`);
      metadataFields.push(`    name: "${exportName}",`);

      output += `export interface ${
        modelName(exportName)
      } extends UnionModel<${exportName}, typeof ${schemaName(exportName)}> {}\n`;
      output += `export const ${modelName(exportName)}: ${modelName(exportName)} = {\n`;
      output += `  __type: {} as ${exportName},\n`;
      output += `  zodSchema: ${schemaName(exportName)},\n`;
      output += `  [Metadata]: {\n${metadataFields.join("\n")}\n  },\n`;
      output += `};\n\n`;

      // Generate variant models
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const variantTypeName = `${exportName}${formattedVariant}`;
        const variantMetadata: string[] = [];
        variantMetadata.push(`    discriminant: "${item.discriminant}",`);
        variantMetadata.push(`    name: "${variantTypeName}",`);

        output += `export interface ${
          modelName(variantTypeName)
        } extends UnionModel<${variantTypeName}, typeof ${schemaName(variantTypeName)}> {}\n`;
        output += `export const ${modelName(variantTypeName)}: ${modelName(variantTypeName)} = {\n`;
        output += `  __type: {} as ${variantTypeName},\n`;
        output += `  zodSchema: ${schemaName(variantTypeName)},\n`;
        output += `  [Metadata]: {\n${variantMetadata.join("\n")}\n  },\n`;
        output += `};\n\n`;
      }
    }
  }

  // Generate DocumentModel
  const modelEntries: string[] = [];
  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (isRecordSchema(item)) {
      modelEntries.push(`  ${exportName}: ${modelName(exportName)}`);
    } else if (isUnionSchema(item)) {
      modelEntries.push(`  ${exportName}: ${modelName(exportName)}`);
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const variantTypeName = `${exportName}${formattedVariant}`;
        modelEntries.push(`  ${variantTypeName}: ${modelName(variantTypeName)}`);
      }
    }
  }

  // Build migrations map (includes both record and union entries)
  let migrationsBlock: string;
  const allMigrationNames = [...recordNames, ...unionNames];
  if (chain.length > 1 && allMigrationNames.length > 0) {
    const migrationEntries = allMigrationNames.map(n => `      ${n}: ${n}Migrations,`).join("\n");
    migrationsBlock = `    migrations: {\n${migrationEntries}\n    },\n`;
  } else {
    migrationsBlock = "";
  }

  output += `export const DocumentModel = {\n`;
  output += `${modelEntries.join(",\n")},\n`;
  output += `  [Metadata]: {\n`;
  output += `    version: ${latestVersion},\n`;
  if (minVersion !== latestVersion) {
    output += `    minSupportedVersion: ${minVersion},\n`;
  }
  output += migrationsBlock;
  output += `  },\n`;
  output += `} as const satisfies DocumentSchema;\n\n`;
  output += `export type DocumentModel = typeof DocumentModel;\n`;

  // --- Generate schema manifest ---
  const models: SchemaManifest["models"] = {};

  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (!isRecordSchema(item)) continue;

    const versions: Record<string, { fields: string[] }> = {};

    for (const { version, schema: versionSchema } of chain) {
      const versionItem = versionSchema[exportName];
      if (versionItem != null && isRecordSchema(versionItem)) {
        versions[String(version)] = {
          fields: Object.keys(versionItem.fields).sort(),
        };
      }
    }

    models[exportName] = { versions };
  }

  const schemaManifest: SchemaManifest = {
    latestVersion,
    minSupportedVersion: minVersion,
    models,
  };

  return { modelsFile: output, schemaManifest };
}
