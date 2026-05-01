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

import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import { convertFieldTypeToZodSchema } from "../ir/irFieldHelpers.js";
import type { ResolvedIrChain, VersionedIrEntry } from "./resolveSchemaChain.js";
import { resolveMinVersion } from "./resolveSchemaChain.js";
import { typesFilePath, versionedSchemaName, versionedTypeName } from "./runtimeSchema.js";

export interface VersionedZodOutput {
  /** schema_vN.ts files keyed by version number */
  zodSchemas: Map<number, string>;
  /** schema.ts re-export of latest version schemas under unversioned names */
  schemaReExport: string;
}

/**
 * Generate Zod schemas for a specific schema version.
 * Uses `.passthrough()` to preserve unknown fields.
 */
function generateZodSchemasForVersion(
  version: number,
  ir: IRealTimeDocumentSchema,
): string {
  let output = GENERATED_FILE_HEADER;

  // Collect type names for import
  const typeNames: string[] = [];
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type === "record") {
      typeNames.push(versionedTypeName(modelKey, version));
    } else if (modelDef.type === "union") {
      typeNames.push(versionedTypeName(modelKey, version));
      for (const variantName of Object.keys(modelDef.union.variants)) {
        typeNames.push(
          `${versionedTypeName(modelKey, version)}${formatVariantName(variantName)}`,
        );
      }
    }
  }

  output += "import type { ZodType } from \"zod\";\n";
  output += "import { z } from \"zod\";\n";

  if (typeNames.length > 0) {
    output += `import type { ${typeNames.sort().join(", ")} } from "${typesFilePath(version)}";\n`;
  }

  output += "\n";

  // Generate record schemas first (unions may depend on them)
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type !== "record") continue;

    const zodSchemaName = versionedSchemaName(modelKey, version);
    const typeName = versionedTypeName(modelKey, version);
    const fieldLines: string[] = [];

    for (const field of modelDef.record.fields) {
      let zodType = convertFieldTypeToZodSchema(field.fieldType, version);
      if (field.isOptional) {
        zodType = `${zodType}.optional()`;
      }
      fieldLines.push(`  ${field.key}: ${zodType}`);
    }

    output += `export const ${zodSchemaName} = z.object({\n${
      fieldLines.join(",\n")
    }\n}).passthrough() satisfies ZodType<${typeName}>;\n\n`;
  }

  // Generate union schemas
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type !== "union") continue;

    const union = modelDef.union;
    const discriminantField = union.discriminant;
    const variantSchemaNames: string[] = [];

    for (const [variantName, variantModelKey] of Object.entries(union.variants)) {
      const formattedVariant = formatVariantName(variantName);
      const variantZodSchemaName = `${versionedSchemaName(modelKey, version)}${formattedVariant}`;
      const variantTypeName = `${versionedTypeName(modelKey, version)}${formattedVariant}`;
      variantSchemaNames.push(variantZodSchemaName);

      // Look up the variant's model to check if it's a record
      const variantModel = ir.models[variantModelKey];
      if (variantModel != null && variantModel.type === "record") {
        const recordZodSchemaName = versionedSchemaName(variantModelKey, version);
        output += `export const ${variantZodSchemaName} = ${recordZodSchemaName}.extend({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}")\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      } else {
        // Non-record variant (e.g. another union): emit a value field referencing the schema
        const refZodSchemaName = versionedSchemaName(variantModelKey, version);
        const refTypeName = versionedTypeName(variantModelKey, version);
        output += `export const ${variantZodSchemaName} = z.object({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}"),\n`;
        output += `  value: z.lazy((): ZodType<${refTypeName}> => ${refZodSchemaName})\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      }
    }

    const unionZodSchemaName = versionedSchemaName(modelKey, version);
    const typeName = versionedTypeName(modelKey, version);
    output +=
      `export const ${unionZodSchemaName} = z.discriminatedUnion("${discriminantField}", [\n  ${
        variantSchemaNames.join(",\n  ")
      }\n]) satisfies ZodType<${typeName}>;\n\n`;
  }

  return output;
}

/**
 * Generate the schema.ts re-export file mapping unversioned names to latest version.
 */
function generateSchemaReExport(
  { ir, version }: VersionedIrEntry,
): string {
  let output = GENERATED_FILE_HEADER;

  const reExports: string[] = [];

  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type === "record") {
      const versioned = versionedSchemaName(modelKey, version);
      reExports.push(
        `export { ${versioned} as ${modelKey}Schema } from "./schema_v${version}.js";`,
      );
    } else if (modelDef.type === "union") {
      const versioned = versionedSchemaName(modelKey, version);
      reExports.push(
        `export { ${versioned} as ${modelKey}Schema } from "./schema_v${version}.js";`,
      );

      // Also re-export union variant schemas
      for (const variantName of Object.keys(modelDef.union.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${versionedSchemaName(modelKey, version)}${formattedVariant}`;
        const unversionedVariant = `${modelKey}${formattedVariant}Schema`;
        reExports.push(
          `export { ${versionedVariant} as ${unversionedVariant} } from "./schema_v${version}.js";`,
        );
      }
    }
  }

  output += reExports.join("\n") + "\n";

  return output;
}

/**
 * Generate per-version Zod schemas from an already-resolved versioned IR chain.
 */
export function generateVersionedZodFromChain(
  resolved: ResolvedIrChain,
  minSupportedVersion?: number,
): VersionedZodOutput {
  const { chain } = resolved;
  const { minVersion } = resolveMinVersion(chain, minSupportedVersion);

  const zodSchemas = new Map<number, string>();

  for (const { version, ir } of chain) {
    if (version < minVersion) continue;

    zodSchemas.set(version, generateZodSchemasForVersion(version, ir));
  }

  const schemaReExport = generateSchemaReExport(chain[chain.length - 1]!);

  return { zodSchemas, schemaReExport };
}
