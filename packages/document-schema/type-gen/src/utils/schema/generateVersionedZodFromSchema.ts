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
import type { VersionedSchemaEntry } from "./resolveSchemaChain.js";
import { resolveSchemaChain } from "./resolveSchemaChain.js";
import type { RuntimeSchema, SchemaField } from "./runtimeSchema.js";
import {
  findRecordExportName,
  isRecordSchema,
  isUnionSchema,
  schemaName,
  TypeKind,
  typesFilePath,
  versionedSchemaName,
  versionedTypeName,
} from "./runtimeSchema.js";

export interface VersionedZodOutput {
  /** schema_vN.ts files keyed by version number */
  zodSchemas: Map<number, string>;
  /** schema.ts re-export of latest version schemas under unversioned names */
  schemaReExport: string;
}

function convertFieldTypeToZodSchema(
  fieldType: SchemaField,
  schema?: RuntimeSchema,
  version?: number,
): string {
  switch (fieldType.type) {
    case TypeKind.ANY:
      return "z.unknown()";
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `z.array(${convertFieldTypeToZodSchema(fieldType.items, schema, version)})`;
      }
      return "z.array(z.unknown())";
    case TypeKind.BOOLEAN:
      return "z.boolean()";
    case TypeKind.DOC_REF:
      return "z.string()";
    case TypeKind.DOUBLE:
      return "z.number()";
    case TypeKind.MEDIA_REF:
      return "z.string()";
    case TypeKind.OBJECT_REF:
      return "z.string()";
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return `${convertFieldTypeToZodSchema(fieldType.item, schema, version)}.optional()`;
      }
      return "z.unknown().optional()";
    case TypeKind.REF: {
      let refSchemaName: string;
      if (fieldType.refType === "record" && schema) {
        const exportName = findRecordExportName(fieldType.name!, schema);
        const name = exportName || fieldType.name || "unknown";
        refSchemaName = version != null ? versionedSchemaName(name, version) : `${name}Schema`;
      } else {
        const name = fieldType.name || "unknown";
        refSchemaName = version != null ? versionedSchemaName(name, version) : `${name}Schema`;
      }
      return `(z.lazy(() => ${refSchemaName}) as any)`;
    }
    case TypeKind.STRING:
      return "z.string()";
    case TypeKind.USER_REF:
      return "z.string()";
    default:
      return "z.unknown()";
  }
}

/**
 * Generate Zod schemas for a specific schema version.
 * Uses `.passthrough()` to preserve unknown fields.
 */
function generateZodSchemasForVersion(
  version: number,
  schema: RuntimeSchema,
): string {
  let output = GENERATED_FILE_HEADER;

  // Collect type names for import
  const typeNames: string[] = [];
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      typeNames.push(versionedTypeName(exportName, version));
    } else if (isUnionSchema(item)) {
      typeNames.push(versionedTypeName(exportName, version));
      for (const variantName of Object.keys(item.variants)) {
        typeNames.push(
          `${versionedTypeName(exportName, version)}${formatVariantName(variantName)}`,
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
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isRecordSchema(item)) continue;

    const zodSchemaName = versionedSchemaName(exportName, version);
    const typeName = versionedTypeName(exportName, version);
    const fieldLines: string[] = [];

    for (const [fieldName, fieldType] of Object.entries(item.fields)) {
      const zodType = convertFieldTypeToZodSchema(fieldType, schema, version);
      fieldLines.push(`  ${fieldName}: ${zodType}`);
    }

    output += `export const ${zodSchemaName} = z.object({\n${
      fieldLines.join(",\n")
    }\n}).passthrough() satisfies ZodType<${typeName}>;\n\n`;
  }

  // Generate union schemas
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isUnionSchema(item)) continue;

    const discriminantField = item.discriminant;
    const variantSchemaNames: string[] = [];

    for (const [variantName, variantType] of Object.entries(item.variants)) {
      const formattedVariant = formatVariantName(variantName);
      const variantZodSchemaName = `${versionedSchemaName(exportName, version)}${formattedVariant}`;
      const variantTypeName = `${versionedTypeName(exportName, version)}${formattedVariant}`;
      variantSchemaNames.push(variantZodSchemaName);

      if (variantType.type === TypeKind.REF && variantType.refType === "record") {
        const recordExport = findRecordExportName(variantType.name!, schema);
        const recordZodSchemaName = recordExport
          ? versionedSchemaName(recordExport, version)
          : `${variantType.name!}Schema`;
        output += `export const ${variantZodSchemaName} = ${recordZodSchemaName}.extend({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}")\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      } else {
        const zodType = convertFieldTypeToZodSchema(variantType, schema, version);
        output += `export const ${variantZodSchemaName} = z.object({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}"),\n`;
        output += `  value: ${zodType}\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      }
    }

    const unionZodSchemaName = versionedSchemaName(exportName, version);
    const typeName = versionedTypeName(exportName, version);
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
  { schema, version }: VersionedSchemaEntry,
): string {
  let output = GENERATED_FILE_HEADER;

  const reExports: string[] = [];

  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      const versioned = versionedSchemaName(exportName, version);
      reExports.push(
        `export { ${versioned} as ${schemaName(exportName)} } from "./schema_v${version}.js";`,
      );
    } else if (isUnionSchema(item)) {
      const versioned = versionedSchemaName(exportName, version);
      reExports.push(
        `export { ${versioned} as ${schemaName(exportName)} } from "./schema_v${version}.js";`,
      );

      // Also re-export union variant schemas
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${versionedSchemaName(exportName, version)}${formattedVariant}`;
        const unversionedVariant = `${exportName}${formattedVariant}Schema`;
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
 * Generate per-version Zod schemas from a schema definition with version chain.
 *
 * @param schema - The schema definition (initial or versioned)
 * @param minSupportedVersion - Minimum version to generate schemas for (defaults to latest)
 * @returns Object containing generated Zod schema code for each output file
 */
export function generateVersionedZodFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): VersionedZodOutput {
  const { chain, minVersion } = resolveSchemaChain(schema, minSupportedVersion);

  const zodSchemas = new Map<number, string>();

  for (const { version, schema: versionSchema } of chain) {
    if (version < minVersion) continue;

    zodSchemas.set(version, generateZodSchemasForVersion(version, versionSchema));
  }

  const schemaReExport = generateSchemaReExport(chain[chain.length - 1]!);

  return { zodSchemas, schemaReExport };
}
