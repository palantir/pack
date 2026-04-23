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
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import type { VersionedSchemaEntry } from "./resolveSchemaChain.js";
import { resolveSchemaChain } from "./resolveSchemaChain.js";
import type { RuntimeSchema, SchemaField } from "./runtimeSchema.js";
import { findRecordExportName, isRecordSchema, isUnionSchema, TypeKind } from "./runtimeSchema.js";

export interface InternalTypesOutput {
  /** _internal/types.ts content */
  internalTypes: string;
  /** _internal/migrations.ts content */
  migrations: string;
  /** _internal/schema.ts content */
  internalSchema: string;
}

/**
 * Convert a schema field type to TypeScript string for internal types.
 */
function convertTypeToTypeScript(fieldType: SchemaField): string {
  switch (fieldType.type) {
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `readonly ${convertTypeToTypeScript(fieldType.items)}[]`;
      }
      return "readonly unknown[]";
    case TypeKind.BOOLEAN:
      return "boolean";
    case TypeKind.DOC_REF:
      return "string";
    case TypeKind.DOUBLE:
      return "number";
    case TypeKind.MEDIA_REF:
      return "string";
    case TypeKind.OBJECT_REF:
      return "string";
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return convertTypeToTypeScript(fieldType.item);
      }
      return "unknown";
    case TypeKind.REF:
      return "unknown";
    case TypeKind.STRING:
      return "string";
    case TypeKind.USER_REF:
      return "string";
    default:
      return "unknown";
  }
}

/**
 * Convert a schema field type to a FieldTypeDescriptor source string.
 */
function convertTypeToFieldTypeDescriptor(fieldType: SchemaField, schema: RuntimeSchema): string {
  switch (fieldType.type) {
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `{ kind: "array", element: ${
          convertTypeToFieldTypeDescriptor(fieldType.items, schema)
        } }`;
      }
      return `{ kind: "array", element: { kind: "primitive" } }`;
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return `{ kind: "optional", inner: ${
          convertTypeToFieldTypeDescriptor(fieldType.item, schema)
        } }`;
      }
      return `{ kind: "optional", inner: { kind: "primitive" } }`;
    case TypeKind.REF: {
      const exportKey = fieldType.refType === "record"
        ? findRecordExportName(fieldType.name!, schema) ?? fieldType.name
        : fieldType.name;
      return `{ kind: "modelRef", model: "${exportKey ?? "unknown"}" }`;
    }
    default:
      return `{ kind: "primitive" }`;
  }
}

/**
 * Convert a schema field type to a Zod schema string.
 */
function convertTypeToZodSchema(fieldType: SchemaField): string {
  switch (fieldType.type) {
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `z.array(${convertTypeToZodSchema(fieldType.items)})`;
      }
      return "z.array(z.unknown())";
    case TypeKind.BOOLEAN:
      return "z.boolean()";
    case TypeKind.DOC_REF:
    case TypeKind.MEDIA_REF:
    case TypeKind.OBJECT_REF:
    case TypeKind.STRING:
    case TypeKind.USER_REF:
      return "z.string()";
    case TypeKind.DOUBLE:
      return "z.number()";
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return `${convertTypeToZodSchema(fieldType.item)}.optional()`;
      }
      return "z.unknown().optional()";
    case TypeKind.REF:
      return "z.unknown()";
    default:
      return "z.unknown()";
  }
}

/** Collected info about all fields for a model across all versions. */
interface AllFieldInfo {
  fieldType: SchemaField;
  /** Versions where this field exists. */
  presentInVersions: Set<number>;
  /** Whether field is always optional. */
  alwaysOptional: boolean;
  /** Default value if any. */
  default?: unknown;
}

/**
 * Represents a migration step for a model between version transitions.
 */
interface MigrationStep {
  name: string;
  addedInVersion: number;
  fields: Map<string, { derivedFrom: string[]; forwardSource: string; default?: unknown }>;
  removedFields: string[];
}

interface RecordModelInfo {
  allFields: Map<string, AllFieldInfo>;
  steps: MigrationStep[];
}

/**
 * Helper to iterate sorted entries of a Map.
 */
function sortedEntries<V>(map: Map<string, V>): [string, V][] {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Collect all record model info across all versions and compute migration steps.
 */
function collectRecordModels(
  chain: VersionedSchemaEntry[],
): Map<string, RecordModelInfo> {
  const allRecordModels = new Map<string, RecordModelInfo>();

  // Initialize models from all versions
  for (const { version, schema } of chain) {
    for (const [exportName, item] of Object.entries(schema)) {
      if (!isRecordSchema(item)) continue;

      if (!allRecordModels.has(exportName)) {
        allRecordModels.set(exportName, {
          allFields: new Map(),
          steps: [],
        });
      }

      const model = allRecordModels.get(exportName)!;

      for (const [fieldName, fieldType] of Object.entries(item.fields)) {
        const existing = model.allFields.get(fieldName);
        if (existing == null) {
          model.allFields.set(fieldName, {
            fieldType,
            presentInVersions: new Set([version]),
            alwaysOptional: fieldType.type === TypeKind.OPTIONAL,
          });
        } else {
          existing.presentInVersions.add(version);
          if (fieldType.type !== TypeKind.OPTIONAL) {
            existing.alwaysOptional = false;
          }
        }
      }
    }
  }

  // Compute migration steps from version diffs
  for (let i = 1; i < chain.length; i++) {
    const prevVersion = chain[i - 1]!;
    const currVersion = chain[i]!;

    for (const [exportName, currItem] of Object.entries(currVersion.schema)) {
      if (!isRecordSchema(currItem)) continue;

      const prevItem = prevVersion.schema[exportName];
      if (prevItem == null || !isRecordSchema(prevItem)) continue;

      const model = allRecordModels.get(exportName);
      if (model == null) continue;

      const prevFields = new Set(Object.keys(prevItem.fields));
      const currFields = new Set(Object.keys(currItem.fields));

      // Fields added in this version
      const addedFields = new Map<
        string,
        { derivedFrom: string[]; forwardSource: string; default?: unknown }
      >();
      for (const fieldName of currFields) {
        if (!prevFields.has(fieldName)) {
          addedFields.set(fieldName, {
            derivedFrom: [],
            forwardSource: "() => undefined",
          });
        }
      }

      // Fields removed in this version
      const removedFields: string[] = [];
      for (const fieldName of prevFields) {
        if (!currFields.has(fieldName)) {
          removedFields.push(fieldName);
        }
      }

      if (addedFields.size > 0 || removedFields.length > 0) {
        model.steps.push({
          name: `v${currVersion.version}`,
          addedInVersion: currVersion.version,
          fields: addedFields,
          removedFields,
        });
      }
    }
  }

  // Mark fields that are not present in ALL versions as optional in internal type
  const totalVersions = chain.length;
  for (const model of allRecordModels.values()) {
    for (const [, fieldInfo] of model.allFields) {
      if (fieldInfo.presentInVersions.size < totalVersions) {
        fieldInfo.alwaysOptional = true;
      }
    }
  }

  return allRecordModels;
}

/**
 * Generate _internal/types.ts content.
 */
function generateInternalTypes(
  allRecordModels: Map<string, RecordModelInfo>,
): string {
  let output = GENERATED_FILE_HEADER;
  output += "\n";

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    output += `/** Internal representation containing all fields across all schema versions. */\n`;
    output += `export interface ${exportName}__Internal {\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const tsType = convertTypeToTypeScript(fieldInfo.fieldType);
      const optional = fieldInfo.alwaysOptional ? "?" : "";
      output += `  readonly ${fieldName}${optional}: ${tsType};\n`;
    }

    output += "}\n\n";
  }

  return output;
}

/**
 * Generate _internal/migrations.ts content.
 */
function generateMigrations(
  allRecordModels: Map<string, RecordModelInfo>,
  latestSchema: RuntimeSchema,
): string {
  let output = GENERATED_FILE_HEADER;
  output +=
    `import type { UnionUpgradeRegistry, UpgradeRegistry } from "@palantir/pack.document-schema.model-types";\n\n`;

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    output += `export const ${exportName}Migrations: UpgradeRegistry<"${exportName}"> = {\n`;
    output += `  modelName: "${exportName}",\n`;

    // allFields
    output += `  allFields: {\n`;
    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const typeDescriptor = convertTypeToFieldTypeDescriptor(fieldInfo.fieldType, latestSchema);
      if (fieldInfo.default !== undefined) {
        output += `    ${fieldName}: { type: ${typeDescriptor}, default: ${
          JSON.stringify(fieldInfo.default)
        } },\n`;
      } else {
        output += `    ${fieldName}: { type: ${typeDescriptor} },\n`;
      }
    }
    output += `  },\n`;

    // steps
    output += `  steps: [\n`;
    for (const step of model.steps) {
      output += `    {\n`;
      output += `      name: "${step.name}",\n`;
      output += `      addedInVersion: ${step.addedInVersion},\n`;
      output += `      fields: {\n`;
      for (const [fieldName, fieldMeta] of step.fields) {
        output += `        ${fieldName}: {\n`;
        output += `          derivedFrom: [${
          fieldMeta.derivedFrom.map(d => `"${d}"`).join(", ")
        }],\n`;
        output += `          forward: ${fieldMeta.forwardSource},\n`;
        if (fieldMeta.default !== undefined) {
          output += `          default: ${JSON.stringify(fieldMeta.default)},\n`;
        }
        output += `        },\n`;
      }
      output += `      },\n`;
      if (step.removedFields.length > 0) {
        output += `      removedFields: [${step.removedFields.map(f => `"${f}"`).join(", ")}],\n`;
      }
      output += `    },\n`;
    }
    output += `  ],\n`;

    output += `};\n\n`;
  }

  // Generate UnionUpgradeRegistry entries for union models
  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (!isUnionSchema(item)) continue;

    output += `export const ${exportName}Migrations: UnionUpgradeRegistry<"${exportName}"> = {\n`;
    output += `  modelName: "${exportName}",\n`;
    output += `  discriminant: "${item.discriminant}",\n`;
    output += `  variants: {\n`;
    for (const [variantKey, variantField] of Object.entries(item.variants)) {
      if (
        variantField.type === "ref" && variantField.refType === "record"
        && variantField.name != null
      ) {
        const variantExportName = findRecordExportName(variantField.name, latestSchema);
        if (variantExportName != null) {
          output += `    "${variantKey}": "${variantExportName}",\n`;
        }
      }
    }
    output += `  },\n`;
    output += `};\n\n`;
  }

  return output;
}

/**
 * Generate _internal/schema.ts content.
 */
function generateInternalSchemaContent(
  allRecordModels: Map<string, RecordModelInfo>,
): string {
  let output = GENERATED_FILE_HEADER;
  output += `import { z } from "zod";\n\n`;

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    output += `export const ${exportName}InternalSchema = z.object({\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const zodType = convertTypeToZodSchema(fieldInfo.fieldType);
      // In internal schema, all fields that might be absent are optional
      if (fieldInfo.alwaysOptional) {
        // If the type already ends with .optional(), don't double-wrap
        if (zodType.endsWith(".optional()")) {
          output += `  ${fieldName}: ${zodType},\n`;
        } else {
          output += `  ${fieldName}: ${zodType}.optional(),\n`;
        }
      } else {
        output += `  ${fieldName}: ${zodType},\n`;
      }
    }

    output += `}).passthrough();\n\n`;
  }

  return output;
}

/**
 * Generate _internal/types.ts, _internal/migrations.ts, and _internal/schema.ts
 * from a versioned schema chain.
 *
 * @param schema - The schema definition (initial or versioned)
 * @returns Object containing generated code for each internal file
 */
export function generateInternalFromSchema(
  schema: SchemaDefinition,
): InternalTypesOutput {
  const { chain } = resolveSchemaChain(schema);
  const latestSchema = chain[chain.length - 1]!.schema;

  const allRecordModels = collectRecordModels(chain);

  const internalTypes = generateInternalTypes(allRecordModels);
  const migrations = generateMigrations(allRecordModels, latestSchema);
  const internalSchema = generateInternalSchemaContent(allRecordModels);

  return { internalTypes, migrations, internalSchema };
}
