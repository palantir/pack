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

import type { ReturnedSchema } from "@palantir/pack.schema";
import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";

// Well-known symbols from @palantir/pack.schema (global via Symbol.for)
const __schemaVersion = Symbol.for("__schemaVersion");
const __previousSchema = Symbol.for("__previousSchema");
const __fieldMigrationMeta = Symbol.for("__fieldMigrationMeta");

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

// Runtime types mirroring the schema structure
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

interface VersionedSchema {
  version: number;
  schema: RuntimeSchema;
}

export interface VersionedTypesOutput {
  /** types_vN.ts files keyed by version number */
  readTypes: Map<number, string>;
  /** writeTypes_vN.ts files keyed by version number */
  writeTypes: Map<number, string>;
  /** types.ts re-export of latest version types under unversioned names */
  typesReExport: string;
}

function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
}

function isUnionSchema(item: RuntimeSchemaItem): item is RuntimeSchemaUnion {
  return item.type === SchemaDefKind.UNION && "variants" in item;
}

/**
 * Walk the schema version chain via __previousSchema to collect all versions.
 * Returns versions in ascending order (v1, v2, v3, ...).
 */
function collectVersionChain(schema: RuntimeSchema): VersionedSchema[] {
  const chain: VersionedSchema[] = [];
  let current: any = schema;

  while (current != null) {
    const version: number = current[__schemaVersion] ?? 1;
    chain.unshift({ version, schema: current });
    current = current[__previousSchema] ?? null;
  }

  return chain;
}

/**
 * Check if a field has a default value in its migration metadata.
 */
function fieldHasDefault(recordDef: RuntimeSchemaRecord, fieldName: string): boolean {
  const meta: Map<string, any> | undefined = (recordDef as any)[__fieldMigrationMeta];
  if (meta == null || !(meta instanceof Map)) return false;
  const fieldMeta = meta.get(fieldName);
  if (fieldMeta == null) return false;
  return "default" in fieldMeta && fieldMeta.default !== undefined;
}

function detectUsedRefTypes(schema: RuntimeSchema): Set<string> {
  const refTypes = new Set<string>();

  function scanField(field: SchemaField): void {
    switch (field.type) {
      case TypeKind.ARRAY:
        if (field.items) scanField(field.items);
        break;
      case TypeKind.DOC_REF:
        refTypes.add("DocumentRef");
        break;
      case TypeKind.MEDIA_REF:
        refTypes.add("MediaRef");
        break;
      case TypeKind.OBJECT_REF:
        refTypes.add("ObjectRef");
        break;
      case TypeKind.OPTIONAL:
        if (field.item) scanField(field.item);
        break;
      case TypeKind.USER_REF:
        refTypes.add("UserRef");
        break;
    }
  }

  for (const item of Object.values(schema)) {
    if (isRecordSchema(item)) {
      for (const f of Object.values(item.fields)) {
        scanField(f);
      }
    } else if (isUnionSchema(item)) {
      for (const v of Object.values(item.variants)) {
        scanField(v);
      }
    }
  }

  return refTypes;
}

function findRecordExportName(recordName: string, schema: RuntimeSchema): string | null {
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item) && item.name === recordName) {
      return exportName;
    }
  }
  return null;
}

function collectReferencedTypes(
  fieldType: SchemaField,
  schema: RuntimeSchema,
  version: number,
  out: Set<string>,
): void {
  switch (fieldType.type) {
    case TypeKind.ARRAY:
      if (fieldType.items) collectReferencedTypes(fieldType.items, schema, version, out);
      break;
    case TypeKind.OPTIONAL:
      if (fieldType.item) collectReferencedTypes(fieldType.item, schema, version, out);
      break;
    case TypeKind.REF: {
      let name: string;
      if (fieldType.refType === "record") {
        name = findRecordExportName(fieldType.name!, schema) || fieldType.name || "unknown";
      } else {
        name = fieldType.name || "unknown";
      }
      out.add(versionedTypeName(name, version));
      break;
    }
  }
}

function convertTypeToTypeScript(
  fieldType: SchemaField,
  schema?: RuntimeSchema,
  version?: number,
): string {
  switch (fieldType.type) {
    case TypeKind.ANY:
      return "any";
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `readonly ${convertTypeToTypeScript(fieldType.items, schema, version)}[]`;
      }
      return "readonly unknown[]";
    case TypeKind.BOOLEAN:
      return "boolean";
    case TypeKind.DOC_REF:
      return "DocumentRef";
    case TypeKind.DOUBLE:
      return "number";
    case TypeKind.MEDIA_REF:
      return "MediaRef";
    case TypeKind.OBJECT_REF:
      return "ObjectRef";
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return convertTypeToTypeScript(fieldType.item, schema, version);
      }
      return "unknown";
    case TypeKind.REF: {
      let name: string;
      if (fieldType.refType === "record" && schema) {
        name = findRecordExportName(fieldType.name!, schema) || fieldType.name || "unknown";
      } else {
        name = fieldType.name || "unknown";
      }
      return version != null ? versionedTypeName(name, version) : name;
    }
    case TypeKind.STRING:
      return "string";
    case TypeKind.USER_REF:
      return "UserRef";
    default:
      return "unknown";
  }
}

/**
 * Generate versioned read type name: RecordName_vN
 */
function versionedTypeName(exportName: string, version: number): string {
  return `${exportName}_v${version}`;
}

/**
 * Generate versioned write type name: RecordNameUpdate_vN
 */
function versionedWriteTypeName(exportName: string, version: number): string {
  return `${exportName}Update_v${version}`;
}

/**
 * Generate read types for a specific schema version.
 * Fields with defaults have their Optional wrapper unwrapped and are required.
 */
function generateReadTypesForVersion(
  version: number,
  schema: RuntimeSchema,
): string {
  const usedRefTypes = detectUsedRefTypes(schema);

  let output = GENERATED_FILE_HEADER;

  if (usedRefTypes.size > 0) {
    const refTypesList = Array.from(usedRefTypes).sort().join(", ");
    output +=
      `import type { ${refTypesList} } from "@palantir/pack.document-schema.model-types";\n`;
  }

  output += "\n";

  // Generate record interfaces
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isRecordSchema(item)) continue;

    const typeName = versionedTypeName(exportName, version);

    if (item.docs) {
      output += `/**\n * ${item.docs}\n */\n`;
    }

    output += `export interface ${typeName} {\n`;

    for (const [fieldName, fieldType] of Object.entries(item.fields)) {
      const hasDefault = fieldHasDefault(item, fieldName);

      if (fieldType.type === TypeKind.OPTIONAL && hasDefault) {
        // Field has default: unwrap Optional, make required
        const innerType = fieldType.item
          ? convertTypeToTypeScript(fieldType.item, schema, version)
          : "unknown";
        output += `  readonly ${fieldName}: ${innerType};\n`;
      } else {
        // Normal field handling
        const tsType = convertTypeToTypeScript(fieldType, schema, version);
        const optional = fieldType.type === TypeKind.OPTIONAL ? "?" : "";
        output += `  readonly ${fieldName}${optional}: ${tsType};\n`;
      }
    }

    output += "}\n\n";
  }

  // Generate union types
  const unionEntries = Object.entries(schema).filter(
    ([_, item]) => isUnionSchema(item),
  );

  for (const [exportName, item] of unionEntries) {
    if (!isUnionSchema(item)) continue;

    const typeName = versionedTypeName(exportName, version);
    const discriminantField = item.discriminant;
    const variantInterfaces: Array<{ name: string; discriminatorValue: string }> = [];

    for (const [variantName, variantType] of Object.entries(item.variants)) {
      const interfaceName = `${typeName}${formatVariantName(variantName)}`;
      variantInterfaces.push({ name: interfaceName, discriminatorValue: variantName });

      if (variantType.type === TypeKind.REF && variantType.refType === "record") {
        const recordExport = findRecordExportName(variantType.name!, schema);
        const recordTypeName = recordExport
          ? versionedTypeName(recordExport, version)
          : variantType.name!;
        output += `export interface ${interfaceName} extends ${recordTypeName} {\n`;
        output += `  readonly ${discriminantField}: "${variantName}";\n`;
        output += "}\n\n";
      } else {
        const tsType = convertTypeToTypeScript(variantType, schema, version);
        output += `export interface ${interfaceName} {\n`;
        output += `  readonly ${discriminantField}: "${variantName}";\n`;
        output += `  readonly value: ${tsType};\n`;
        output += "}\n\n";
      }
    }

    output += `export type ${typeName} = ${variantInterfaces.map(v => v.name).join(" | ")};\n\n`;

    for (const variant of variantInterfaces) {
      output +=
        `export function is${variant.name}(value: ${typeName}): value is ${variant.name} {\n`;
      output += `  return value.${discriminantField} === "${variant.discriminatorValue}";\n`;
      output += "}\n\n";
    }
  }

  return output;
}

/**
 * Generate write types for a specific schema version.
 * All fields are optional in write types.
 */
function generateWriteTypesForVersion(
  version: number,
  schema: RuntimeSchema,
): string {
  const usedRefTypes = detectUsedRefTypes(schema);

  // Collect referenced schema-local types (refs to other records/unions)
  const referencedLocalTypes = new Set<string>();
  for (const item of Object.values(schema)) {
    if (!isRecordSchema(item)) continue;
    for (const fieldType of Object.values(item.fields)) {
      collectReferencedTypes(fieldType, schema, version, referencedLocalTypes);
    }
  }

  let output = GENERATED_FILE_HEADER;

  if (usedRefTypes.size > 0) {
    const refTypesList = Array.from(usedRefTypes).sort().join(", ");
    output +=
      `import type { ${refTypesList} } from "@palantir/pack.document-schema.model-types";\n`;
  }

  if (referencedLocalTypes.size > 0) {
    const localTypesList = Array.from(referencedLocalTypes).sort().join(", ");
    output += `import type { ${localTypesList} } from "./types_v${version}.js";\n`;
  }

  output += "\n";

  // Generate record write types
  for (const [exportName, item] of Object.entries(schema)) {
    if (!isRecordSchema(item)) continue;

    const typeName = versionedWriteTypeName(exportName, version);

    output += `export type ${typeName} = {\n`;

    for (const [fieldName, fieldType] of Object.entries(item.fields)) {
      // All fields are optional in write types
      const tsType = convertTypeToTypeScript(fieldType, schema, version);
      output += `  readonly ${fieldName}?: ${tsType};\n`;
    }

    output += "};\n\n";
  }

  return output;
}

/**
 * Generate the types.ts re-export file that maps unversioned names to the latest version.
 */
function generateTypesReExport(
  latestVersion: number,
  schema: RuntimeSchema,
): string {
  let output = GENERATED_FILE_HEADER;

  const reExports: string[] = [];

  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      const versioned = versionedTypeName(exportName, latestVersion);
      reExports.push(
        `export type { ${versioned} as ${exportName} } from "./types_v${latestVersion}.js";`,
      );
    } else if (isUnionSchema(item)) {
      const versioned = versionedTypeName(exportName, latestVersion);
      reExports.push(
        `export type { ${versioned} as ${exportName} } from "./types_v${latestVersion}.js";`,
      );

      // Also re-export union variant types
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${
          versionedTypeName(exportName, latestVersion)
        }${formattedVariant}`;
        const unversionedVariant = `${exportName}${formattedVariant}`;
        reExports.push(
          `export type { ${versionedVariant} as ${unversionedVariant} } from "./types_v${latestVersion}.js";`,
        );
      }
    }
  }

  output += reExports.join("\n") + "\n";

  return output;
}

/**
 * Generate per-version public types and write types from a schema with version chain.
 *
 * @param schema - The latest schema in the chain (with __previousSchema metadata)
 * @param minSupportedVersion - Minimum version to generate types for (defaults to latest)
 * @returns Object containing generated code for each output file
 */
export function generateVersionedTypesFromSchema(
  schema: ReturnedSchema,
  minSupportedVersion?: number,
): VersionedTypesOutput {
  const runtimeSchema = schema as unknown as RuntimeSchema;
  const chain = collectVersionChain(runtimeSchema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;
  const minVersion = minSupportedVersion ?? latestVersion;

  const readTypes = new Map<number, string>();
  const writeTypes = new Map<number, string>();

  for (const { version, schema: versionSchema } of chain) {
    if (version < minVersion) continue;

    readTypes.set(version, generateReadTypesForVersion(version, versionSchema));
    writeTypes.set(version, generateWriteTypesForVersion(version, versionSchema));
  }

  const typesReExport = generateTypesReExport(latestVersion, chain[chain.length - 1]!.schema);

  return { readTypes, writeTypes, typesReExport };
}
