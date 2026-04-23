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
import type { RuntimeSchema, SchemaField, VersionedSchemaEntry } from "./runtimeSchema.js";
import {
  findRecordExportName,
  isRecordSchema,
  isUnionSchema,
  resolveSchemaChain,
  TypeKind,
  typesFilePath,
  versionedTypeName,
  versionedWriteTypeName,
} from "./runtimeSchema.js";

export interface VersionedTypesOutput {
  /** types_vN.ts files keyed by version number */
  readTypes: Map<number, string>;
  /** writeTypes_vN.ts files keyed by version number */
  writeTypes: Map<number, string>;
  /** types.ts re-export of latest version types under unversioned names */
  typesReExport: string;
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
 * Generate read types for a specific schema version.
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
      const tsType = convertTypeToTypeScript(fieldType, schema, version);
      const optional = fieldType.type === TypeKind.OPTIONAL ? "?" : "";
      output += `  readonly ${fieldName}${optional}: ${tsType};\n`;
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
    output += `import type { ${localTypesList} } from "${typesFilePath(version)}";\n`;
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
function generateTypesReExport({ schema, version }: VersionedSchemaEntry): string {
  const reExports: string[] = [];
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item)) {
      const versioned = versionedTypeName(exportName, version);
      reExports.push(
        `export type { ${versioned} as ${exportName} } from "${typesFilePath(version)}";`,
      );
    } else if (isUnionSchema(item)) {
      const versioned = versionedTypeName(exportName, version);
      reExports.push(
        `export type { ${versioned} as ${exportName} } from "${typesFilePath(version)}";`,
      );

      // Also re-export union variant types
      for (const variantName of Object.keys(item.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${versionedTypeName(exportName, version)}${formattedVariant}`;
        const unversionedVariant = `${exportName}${formattedVariant}`;
        reExports.push(
          `export type { ${versionedVariant} as ${unversionedVariant} } from "${
            typesFilePath(version)
          }";`,
        );
      }
    }
  }

  return GENERATED_FILE_HEADER + reExports.join("\n") + "\n";
}

/**
 * Generate per-version public types and write types from a schema with version chain.
 *
 * @param schema - The schema, initial or versioned
 * @param minSupportedVersion - Minimum version to generate types for (defaults to latest)
 * @returns Object containing generated code for each output file
 */
export function generateVersionedTypesFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): VersionedTypesOutput {
  const { chain, latestVersion, minVersion } = resolveSchemaChain(schema, minSupportedVersion);

  const readTypes = new Map<number, string>();
  const writeTypes = new Map<number, string>();

  for (const { version, schema: versionSchema } of chain) {
    if (version < minVersion) continue;

    readTypes.set(version, generateReadTypesForVersion(version, versionSchema));
    writeTypes.set(version, generateWriteTypesForVersion(version, versionSchema));
  }

  const typesReExport = generateTypesReExport(chain[chain.length - 1]!);

  return { readTypes, writeTypes, typesReExport };
}
