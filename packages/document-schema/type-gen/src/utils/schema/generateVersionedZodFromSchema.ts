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

const TypeKind = {
  ANY: "any",
  ARRAY: "array",
  BOOLEAN: "boolean",
  DOC_REF: "docRef",
  DOUBLE: "double",
  MEDIA_REF: "mediaRef",
  OBJECT_REF: "objectRef",
  OPTIONAL: "optional",
  REF: "ref",
  STRING: "string",
  USER_REF: "userRef",
} as const;

const SchemaDefKind = {
  RECORD: "record",
  UNION: "union",
} as const;

interface SchemaField {
  readonly type: string;
  readonly items?: SchemaField;
  readonly item?: SchemaField;
  readonly refType?: "record" | "union";
  readonly name?: string;
}

interface RuntimeSchemaRecord {
  readonly type: typeof SchemaDefKind.RECORD;
  readonly name: string;
  readonly docs?: string;
  readonly fields: Readonly<Record<string, SchemaField>>;
}

interface RuntimeSchemaUnion {
  readonly type: typeof SchemaDefKind.UNION;
  readonly name?: string;
  readonly variants: Readonly<Record<string, SchemaField>>;
  readonly discriminant: string;
}

type RuntimeSchemaItem = RuntimeSchemaRecord | RuntimeSchemaUnion;
type RuntimeSchema = Record<string, RuntimeSchemaItem>;

interface VersionedSchemaEntry {
  version: number;
  schema: RuntimeSchema;
}

export interface VersionedZodOutput {
  /** schema_vN.ts files keyed by version number */
  zodSchemas: Map<number, string>;
  /** _internal/schema.ts — internal schema with all fields across all versions */
  internalSchema: string;
  /** schema.ts re-export of latest version schemas under unversioned names */
  schemaReExport: string;
}

function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
}

function isUnionSchema(item: RuntimeSchemaItem): item is RuntimeSchemaUnion {
  return item.type === SchemaDefKind.UNION && "variants" in item;
}

function collectVersionChain(input: SchemaDefinition): VersionedSchemaEntry[] {
  const chain: VersionedSchemaEntry[] = [];
  let current: SchemaDefinition = input;

  while (current.type === "versioned") {
    chain.unshift({ version: current.version, schema: current.models as RuntimeSchema });
    current = current.previous;
  }
  chain.unshift({ version: 1, schema: current.models as RuntimeSchema });

  return chain;
}

function findRecordExportName(recordName: string, schema: RuntimeSchema): string | null {
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item) && item.name === recordName) {
      return exportName;
    }
  }
  return null;
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
        return convertFieldTypeToZodSchema(fieldType.item, schema, version);
      }
      return "z.unknown()";
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
      return `z.lazy(() => ${refSchemaName}) as any`;
    }
    case TypeKind.STRING:
      return "z.string()";
    case TypeKind.USER_REF:
      return "z.string()";
    default:
      return "z.unknown()";
  }
}

function versionedSchemaName(exportName: string, version: number): string {
  return `${exportName}Schema_v${version}`;
}

/**
 * Generate Zod schemas for a specific schema version.
 */
function generateZodSchemasForVersion(
  version: number,
  schema: RuntimeSchema,
  typeImportPath: string,
): string {
  let output = GENERATED_FILE_HEADER;

  // Collect type names for import
  const typeNames: string[] = [];
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      typeNames.push(`${exportName}_v${version}`);
    } else if (isUnionSchema(item)) {
      typeNames.push(`${exportName}_v${version}`);
      for (const variantName of Object.keys(item.variants)) {
        typeNames.push(`${exportName}_v${version}${formatVariantName(variantName)}`);
      }
    }
  }

  output += "import type { ZodType } from \"zod\";\n";
  output += "import { z } from \"zod\";\n";

  if (typeNames.length > 0) {
    output += `import type { ${typeNames.sort().join(", ")} } from "${typeImportPath}";\n`;
  }

  output += "\n";

  // Generate record schemas first (unions may depend on them)
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isRecordSchema(item)) continue;

    const schemaName = versionedSchemaName(exportName, version);
    const typeName = `${exportName}_v${version}`;
    const fieldLines: string[] = [];

    for (const [fieldName, fieldType] of Object.entries(item.fields)) {
      if (fieldType.type === TypeKind.OPTIONAL) {
        const innerZod = fieldType.item
          ? convertFieldTypeToZodSchema(fieldType.item, schema, version)
          : "z.unknown()";
        fieldLines.push(`  ${fieldName}: ${innerZod}.optional()`);
      } else {
        const zodType = convertFieldTypeToZodSchema(fieldType, schema, version);
        fieldLines.push(`  ${fieldName}: ${zodType}`);
      }
    }

    output += `export const ${schemaName} = z.object({\n${
      fieldLines.join(",\n")
    }\n}) satisfies ZodType<${typeName}>;\n\n`;
  }

  // Generate union schemas
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isUnionSchema(item)) continue;

    const discriminantField = item.discriminant;
    const variantSchemaNames: string[] = [];

    for (const [variantName, variantType] of Object.entries(item.variants)) {
      const formattedVariant = formatVariantName(variantName);
      const variantSchemaName = `${versionedSchemaName(exportName, version)}${formattedVariant}`;
      const variantTypeName = `${exportName}_v${version}${formattedVariant}`;
      variantSchemaNames.push(variantSchemaName);

      if (variantType.type === TypeKind.REF && variantType.refType === "record") {
        const recordExport = findRecordExportName(variantType.name!, schema);
        const recordSchemaName = recordExport
          ? versionedSchemaName(recordExport, version)
          : `${variantType.name!}Schema`;
        output += `export const ${variantSchemaName} = ${recordSchemaName}.extend({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}")\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      } else {
        const zodType = convertFieldTypeToZodSchema(variantType, schema, version);
        output += `export const ${variantSchemaName} = z.object({\n`;
        output += `  ${discriminantField}: z.literal("${variantName}"),\n`;
        output += `  value: ${zodType}\n`;
        output += `}) satisfies ZodType<${variantTypeName}>;\n\n`;
      }
    }

    const schemaName = versionedSchemaName(exportName, version);
    const typeName = `${exportName}_v${version}`;
    output += `export const ${schemaName} = z.discriminatedUnion("${discriminantField}", [\n  ${
      variantSchemaNames.join(",\n  ")
    }\n]) satisfies ZodType<${typeName}>;\n\n`;
  }

  return output;
}

/**
 * Generate the internal Zod schema with all fields across all versions, all optional, with `.passthrough()`.
 */
function generateInternalZodSchema(
  chain: VersionedSchemaEntry[],
): string {
  let output = GENERATED_FILE_HEADER;
  output += "import { z } from \"zod\";\n\n";

  // Collect all fields across all versions for each record
  const allRecordFields = new Map<string, Map<string, { zodType: string; isOptional: boolean }>>();

  for (const { schema } of chain) {
    for (const [exportName, item] of Object.entries(schema)) {
      if (!isRecordSchema(item)) continue;

      if (!allRecordFields.has(exportName)) {
        allRecordFields.set(exportName, new Map());
      }

      const fieldMap = allRecordFields.get(exportName)!;

      for (const [fieldName, fieldType] of Object.entries(item.fields)) {
        if (fieldMap.has(fieldName)) continue;

        if (fieldType.type === TypeKind.OPTIONAL) {
          const innerZod = fieldType.item
            ? convertFieldTypeToZodSchema(fieldType.item, schema)
            : "z.unknown()";
          fieldMap.set(fieldName, { zodType: innerZod, isOptional: true });
        } else {
          const zodType = convertFieldTypeToZodSchema(fieldType, schema);
          fieldMap.set(fieldName, { zodType, isOptional: false });
        }
      }
    }
  }

  // Emit internal schemas — all fields optional
  for (const [exportName, fieldMap] of allRecordFields) {
    const fieldLines: string[] = [];

    for (const [fieldName, { zodType }] of fieldMap) {
      fieldLines.push(`  ${fieldName}: ${zodType}.optional()`);
    }

    output += `export const ${exportName}InternalSchema = z.object({\n${
      fieldLines.join(",\n")
    }\n}).passthrough();\n\n`;
  }

  return output;
}

/**
 * Generate the schema.ts re-export file mapping unversioned names to latest version.
 */
function generateSchemaReExport(
  latestVersion: number,
  schema: RuntimeSchema,
): string {
  let output = GENERATED_FILE_HEADER;

  const reExports: string[] = [];

  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      const versioned = versionedSchemaName(exportName, latestVersion);
      reExports.push(
        `export { ${versioned} as ${exportName}Schema } from "./schema_v${latestVersion}.js";`,
      );
    } else if (isUnionSchema(item)) {
      const versioned = versionedSchemaName(exportName, latestVersion);
      reExports.push(
        `export { ${versioned} as ${exportName}Schema } from "./schema_v${latestVersion}.js";`,
      );

      // Also re-export union variant schemas
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${
          versionedSchemaName(exportName, latestVersion)
        }${formattedVariant}`;
        const unversionedVariant = `${exportName}${formattedVariant}Schema`;
        reExports.push(
          `export { ${versionedVariant} as ${unversionedVariant} } from "./schema_v${latestVersion}.js";`,
        );
      }
    }
  }

  output += reExports.join("\n") + "\n";

  return output;
}

/**
 * Generate per-version Zod schemas from a schema with version chain.
 *
 * @param schema - The schema (ReturnedSchema for v1, or VersionedSchema for multi-version)
 * @param minSupportedVersion - Minimum version to generate schemas for (defaults to latest)
 * @param typeImportPathBase - Import path base for per-version type definitions
 * @returns Object containing generated Zod schema code for each output file
 */
export function generateVersionedZodFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
  typeImportPathBase?: string,
): VersionedZodOutput {
  const chain = collectVersionChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;
  const minVersion = minSupportedVersion ?? latestVersion;
  const importBase = typeImportPathBase ?? "./types";

  const zodSchemas = new Map<number, string>();

  for (const { version, schema: versionSchema } of chain) {
    if (version < minVersion) continue;

    const typeImportPath = `${importBase}_v${version}.js`;
    zodSchemas.set(version, generateZodSchemasForVersion(version, versionSchema, typeImportPath));
  }

  const internalSchema = generateInternalZodSchema(chain);
  const schemaReExport = generateSchemaReExport(latestVersion, chain[chain.length - 1]!.schema);

  return { zodSchemas, internalSchema, schemaReExport };
}
