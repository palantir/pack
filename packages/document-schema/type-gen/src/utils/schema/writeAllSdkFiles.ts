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

import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { generateIndexFromChain } from "./generateIndexFromSchema.js";
import { generateInternalFromChain } from "./generateInternalFromSchema.js";
import { generateModelMetadataFromChain } from "./generateModelMetadataFromSchema.js";
import { generateScopeFromChain } from "./generateScopeFromSchema.js";
import { generateVersionedTypesFromChain } from "./generateVersionedTypesFromSchema.js";
import { generateVersionedZodFromChain } from "./generateVersionedZodFromSchema.js";
import { generateVersionsFromChain } from "./generateVersionsFromSchema.js";
import type { ResolvedIrChain } from "./resolveSchemaChain.js";

/**
 * Generate every versioned SDK output file from a resolved IR chain and write
 * them to `outputDir`. Shared between the in-process `schema gen-types`
 * command and the IR-driven `ir gen-types` command.
 */
export async function writeAllSdkFiles(
  resolved: ResolvedIrChain,
  outputDir: string,
  minSupportedVersion: number | undefined,
): Promise<void> {
  await fs.ensureDir(outputDir);

  // Versioned types
  consola.info("Generating versioned types...");
  const types = generateVersionedTypesFromChain(resolved, minSupportedVersion);
  for (const [version, content] of types.readTypes) {
    const filePath = path.join(outputDir, `types_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated read types: ${filePath}`);
  }
  for (const [version, content] of types.writeTypes) {
    const filePath = path.join(outputDir, `writeTypes_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated write types: ${filePath}`);
  }
  const typesPath = path.join(outputDir, "types.ts");
  await fs.writeFile(typesPath, types.typesReExport, "utf8");
  consola.success(`Generated types re-export: ${typesPath}`);

  // Versioned Zod
  consola.info("Generating versioned Zod schemas...");
  const zod = generateVersionedZodFromChain(resolved, minSupportedVersion);
  for (const [version, content] of zod.zodSchemas) {
    const filePath = path.join(outputDir, `schema_v${version}.ts`);
    await fs.writeFile(filePath, content, "utf8");
    consola.success(`Generated Zod schema: ${filePath}`);
  }
  const schemaPath = path.join(outputDir, "schema.ts");
  await fs.writeFile(schemaPath, zod.schemaReExport, "utf8");
  consola.success(`Generated schema re-export: ${schemaPath}`);

  // Internal
  consola.info("Generating internal types and upgrades...");
  const internal = generateInternalFromChain(resolved);
  const internalDir = path.join(outputDir, "_internal");
  await fs.ensureDir(internalDir);
  await fs.writeFile(path.join(internalDir, "types.ts"), internal.internalTypes, "utf8");
  consola.success(`Generated internal types: ${path.join(internalDir, "types.ts")}`);
  await fs.writeFile(path.join(internalDir, "upgrades.ts"), internal.upgrades, "utf8");
  consola.success(`Generated upgrades: ${path.join(internalDir, "upgrades.ts")}`);
  await fs.writeFile(path.join(internalDir, "schema.ts"), internal.internalSchema, "utf8");
  consola.success(`Generated internal schema: ${path.join(internalDir, "schema.ts")}`);

  // versions.ts
  consola.info("Generating version types...");
  const versionsContent = generateVersionsFromChain(resolved, minSupportedVersion);
  const versionsPath = path.join(outputDir, "versions.ts");
  await fs.writeFile(versionsPath, versionsContent, "utf8");
  consola.success(`Generated versions: ${versionsPath}`);

  // index.ts
  consola.info("Generating index barrel export...");
  const indexContent = generateIndexFromChain(resolved, minSupportedVersion);
  const indexPath = path.join(outputDir, "index.ts");
  await fs.writeFile(indexPath, indexContent, "utf8");
  consola.success(`Generated index: ${indexPath}`);

  // models.ts
  consola.info("Generating model metadata...");
  const modelMetadata = generateModelMetadataFromChain(resolved, minSupportedVersion);
  const modelsPath = path.join(outputDir, "models.ts");
  await fs.writeFile(modelsPath, modelMetadata.modelsFile, "utf8");
  consola.success(`Generated models: ${modelsPath}`);

  // versionedDocRef.ts
  consola.info("Generating versioned document ref types...");
  const versionedDocRefContent = generateScopeFromChain(resolved, minSupportedVersion);
  const versionedDocRefPath = path.join(outputDir, "versionedDocRef.ts");
  await fs.writeFile(versionedDocRefPath, versionedDocRefContent, "utf8");
  consola.success(`Generated versioned doc ref: ${versionedDocRefPath}`);
}

export function parseMinVersion(minVersion: string | undefined): number | undefined {
  if (minVersion == null) return undefined;
  const parsed = parseInt(minVersion, 10);
  if (isNaN(parsed)) {
    throw new Error(`--min-version must be a valid integer, got: "${minVersion}"`);
  }
  return parsed;
}
