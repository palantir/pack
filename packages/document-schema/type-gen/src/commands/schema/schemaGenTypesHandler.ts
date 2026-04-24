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

import type { InitialSchema, SchemaDefinition } from "@palantir/pack.schema";
import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import { generateIndexFromSchema } from "../../utils/schema/generateIndexFromSchema.js";
import { generateInternalFromSchema } from "../../utils/schema/generateInternalFromSchema.js";
import { generateModelMetadataFromSchema } from "../../utils/schema/generateModelMetadataFromSchema.js";
import { generateScopeFromSchema } from "../../utils/schema/generateScopeFromSchema.js";
import { generateVersionedTypesFromSchema } from "../../utils/schema/generateVersionedTypesFromSchema.js";
import { generateVersionedZodFromSchema } from "../../utils/schema/generateVersionedZodFromSchema.js";
import { generateVersionsFromSchema } from "../../utils/schema/generateVersionsFromSchema.js";
import { extractValidSchema } from "../../utils/schema/validateSchemaModule.js";

interface SchemaGenTypesOptions {
  input: string;
  output: string;
  minVersion?: string;
}

function extractSchemaDefinition(schemaModule: unknown): SchemaDefinition {
  const mod = schemaModule as Record<string, unknown>;
  const defaultExport = mod.default;

  if (
    typeof defaultExport === "object" && defaultExport != null
    && "type" in defaultExport
    && (defaultExport.type === "initial" || defaultExport.type === "versioned")
  ) {
    return defaultExport as SchemaDefinition;
  }

  // Wrap plain ModelDefs as InitialSchema
  const models = extractValidSchema(schemaModule);
  return { type: "initial", version: 1, models } satisfies InitialSchema;
}

export async function schemaGenTypesHandler(options: SchemaGenTypesOptions): Promise<void> {
  const { input, output: outputDir, minVersion } = options;

  const inputPath = path.resolve(input);

  if (!await fs.pathExists(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  consola.info(`Loading schema from: ${inputPath}`);

  const schemaUrl = pathToFileURL(inputPath).href;
  const schemaModule: unknown = await import(schemaUrl);

  const schema = extractSchemaDefinition(schemaModule);
  let minSupportedVersion: number | undefined;
  if (minVersion != null) {
    minSupportedVersion = parseInt(minVersion, 10);
    if (isNaN(minSupportedVersion)) {
      throw new Error(`--min-version must be a valid integer, got: "${minVersion}"`);
    }
  }

  const resolvedOutputDir = path.resolve(outputDir);
  await fs.ensureDir(resolvedOutputDir);

  // Generate versioned types
  consola.info("Generating versioned types...");
  const result = generateVersionedTypesFromSchema(schema, minSupportedVersion);

  // Write per-version read types
  for (const [version, content] of result.readTypes) {
    const filePath = path.join(resolvedOutputDir, `types_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated read types: ${filePath}`);
  }

  // Write per-version write types
  for (const [version, content] of result.writeTypes) {
    const filePath = path.join(resolvedOutputDir, `writeTypes_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated write types: ${filePath}`);
  }

  // Write types.ts re-export
  const typesPath = path.join(resolvedOutputDir, "types.ts");
  await fs.writeFile(typesPath, result.typesReExport, "utf8");
  consola.success(`Generated types re-export: ${typesPath}`);

  // Generate per-version Zod schemas
  consola.info("Generating versioned Zod schemas...");
  const zodResult = generateVersionedZodFromSchema(schema, minSupportedVersion);

  for (const [version, content] of zodResult.zodSchemas) {
    const filePath = path.join(resolvedOutputDir, `schema_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated Zod schema: ${filePath}`);
  }

  // Write schema.ts re-export
  const schemaPath = path.join(resolvedOutputDir, "schema.ts");
  await fs.writeFile(schemaPath, zodResult.schemaReExport, "utf8");
  consola.success(`Generated schema re-export: ${schemaPath}`);

  // Generate internal files
  consola.info("Generating internal types and upgrades...");
  const internal = generateInternalFromSchema(schema);

  const internalDir = path.join(resolvedOutputDir, "_internal");
  await fs.ensureDir(internalDir);

  const internalTypesPath = path.join(internalDir, "types.ts");
  await fs.writeFile(internalTypesPath, internal.internalTypes, "utf8");
  consola.success(`Generated internal types: ${internalTypesPath}`);

  const upgradesPath = path.join(internalDir, "upgrades.ts");
  await fs.writeFile(upgradesPath, internal.upgrades, "utf8");
  consola.success(`Generated upgrades: ${upgradesPath}`);

  const internalSchemaPath = path.join(internalDir, "schema.ts");
  await fs.writeFile(internalSchemaPath, internal.internalSchema, "utf8");
  consola.success(`Generated internal schema: ${internalSchemaPath}`);

  // Generate versions.ts
  consola.info("Generating version types...");
  const versionsContent = generateVersionsFromSchema(schema, minSupportedVersion);
  const versionsPath = path.join(resolvedOutputDir, "versions.ts");
  await fs.writeFile(versionsPath, versionsContent, "utf8");
  consola.success(`Generated versions: ${versionsPath}`);

  // Generate index.ts barrel export
  consola.info("Generating index barrel export...");
  const indexContent = generateIndexFromSchema(schema, minSupportedVersion);
  const indexPath = path.join(resolvedOutputDir, "index.ts");
  await fs.writeFile(indexPath, indexContent, "utf8");
  consola.success(`Generated index: ${indexPath}`);

  // Generate models.ts with version metadata
  consola.info("Generating model metadata...");
  const modelMetadata = generateModelMetadataFromSchema(schema, minSupportedVersion);

  const modelsPath = path.join(resolvedOutputDir, "models.ts");
  await fs.writeFile(modelsPath, modelMetadata.modelsFile, "utf8");
  consola.success(`Generated models: ${modelsPath}`);

  // Generate versionedDocRef.ts
  consola.info("Generating versioned document ref types...");
  const versionedDocRefContent = generateScopeFromSchema(schema, minSupportedVersion);
  const versionedDocRefPath = path.join(resolvedOutputDir, "versionedDocRef.ts");
  await fs.writeFile(versionedDocRefPath, versionedDocRefContent, "utf8");
  consola.success(`Generated versioned doc ref: ${versionedDocRefPath}`);
}
