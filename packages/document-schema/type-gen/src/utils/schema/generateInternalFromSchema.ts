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
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";

// Well-known symbols from @palantir/pack.schema (global via Symbol.for)
const __schemaVersion = Symbol.for("__schemaVersion");
const __previousSchema = Symbol.for("__previousSchema");
const __fieldMigrationMeta = Symbol.for("__fieldMigrationMeta");

const TypeKind = {
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

function findRecordExportName(recordName: string, schema: RuntimeSchema): string | null {
  for (const [exportName, item] of Object.entries(schema)) {
    if (item.type === SchemaDefKind.RECORD && "fields" in item && item.name === recordName) {
      return exportName;
    }
  }
  return null;
}

interface VersionedSchema {
  version: number;
  schema: RuntimeSchema;
}

export interface InternalTypesOutput {
  /** _internal/types.ts content */
  internalTypes: string;
  /** _internal/migrations.ts content */
  migrations: string;
  /** _internal/schema.ts content */
  internalSchema: string;
}

function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
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
function convertTypeToFieldTypeDescriptor(fieldType: SchemaField): string {
  switch (fieldType.type) {
    case TypeKind.ARRAY:
      if (fieldType.items) {
        return `{ kind: "array", element: ${convertTypeToFieldTypeDescriptor(fieldType.items)} }`;
      }
      return `{ kind: "array", element: { kind: "primitive" } }`;
    case TypeKind.OPTIONAL:
      if (fieldType.item) {
        return `{ kind: "optional", inner: ${convertTypeToFieldTypeDescriptor(fieldType.item)} }`;
      }
      return `{ kind: "optional", inner: { kind: "primitive" } }`;
    case TypeKind.REF:
      return `{ kind: "modelRef", model: "${fieldType.name ?? "unknown"}" }`;
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

interface MigrationFieldMeta {
  derivedFrom?: string[];
  forward?: (...args: any[]) => any;
  default?: unknown;
}

/**
 * Get field migration metadata from a record def.
 */
function getFieldMeta(
  record: RuntimeSchemaRecord,
  fieldName: string,
): MigrationFieldMeta | undefined {
  const meta: Map<string, any> | undefined = (record as any)[__fieldMigrationMeta];
  if (meta == null || !(meta instanceof Map)) return undefined;
  return meta.get(fieldName) as MigrationFieldMeta | undefined;
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

/**
 * Generate _internal/types.ts, _internal/migrations.ts, and _internal/schema.ts
 * from a versioned schema chain.
 */
export function generateInternalFromSchema(
  schema: ReturnedSchema,
): InternalTypesOutput {
  const runtimeSchema = schema as unknown as RuntimeSchema;
  const chain = collectVersionChain(runtimeSchema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  // Collect all record model names (export names) across all versions
  const allRecordModels = new Map<string, {
    allFields: Map<string, AllFieldInfo>;
    steps: MigrationStep[];
  }>();

  // Initialize models from all versions
  for (const { version, schema: versionSchema } of chain) {
    for (const [exportName, item] of Object.entries(versionSchema)) {
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
          const fieldMeta = getFieldMeta(item, fieldName);
          model.allFields.set(fieldName, {
            fieldType,
            presentInVersions: new Set([version]),
            alwaysOptional: fieldType.type === TypeKind.OPTIONAL,
            default: fieldMeta?.default,
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
  const allVersionNumbers = chain.map(c => c.version);
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
          const fieldMeta = getFieldMeta(currItem, fieldName);
          if (fieldMeta != null) {
            const derivedFrom = fieldMeta.derivedFrom ?? [];
            const forwardSource = fieldMeta.forward != null
              ? fieldMeta.forward.toString()
              : "() => undefined";
            addedFields.set(fieldName, {
              derivedFrom,
              forwardSource,
              default: fieldMeta.default,
            });
          } else {
            addedFields.set(fieldName, {
              derivedFrom: [],
              forwardSource: "() => undefined",
            });
          }
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

  // --- Generate _internal/types.ts ---
  let internalTypes = GENERATED_FILE_HEADER;
  internalTypes += "\n";

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    internalTypes +=
      `/** Internal representation containing all fields across all schema versions. */\n`;
    internalTypes += `export interface ${exportName}__Internal {\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const tsType = convertTypeToTypeScript(fieldInfo.fieldType);
      const optional = fieldInfo.alwaysOptional ? "?" : "";
      internalTypes += `  readonly ${fieldName}${optional}: ${tsType};\n`;
    }

    internalTypes += "}\n\n";
  }

  // --- Generate _internal/migrations.ts ---
  let migrations = GENERATED_FILE_HEADER;
  migrations +=
    `import type { MigrationRegistry, UnionMigrationRegistry } from "@palantir/pack.document-schema.model-types";\n\n`;

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    migrations += `export const ${exportName}Migrations: MigrationRegistry<"${exportName}"> = {\n`;
    migrations += `  modelName: "${exportName}",\n`;

    // allFields
    migrations += `  allFields: {\n`;
    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const typeDescriptor = convertTypeToFieldTypeDescriptor(fieldInfo.fieldType);
      if (fieldInfo.default !== undefined) {
        migrations += `    ${fieldName}: { type: ${typeDescriptor}, default: ${
          JSON.stringify(fieldInfo.default)
        } },\n`;
      } else {
        migrations += `    ${fieldName}: { type: ${typeDescriptor} },\n`;
      }
    }
    migrations += `  },\n`;

    // steps
    migrations += `  steps: [\n`;
    for (const step of model.steps) {
      migrations += `    {\n`;
      migrations += `      name: "${step.name}",\n`;
      migrations += `      addedInVersion: ${step.addedInVersion},\n`;
      migrations += `      fields: {\n`;
      for (const [fieldName, fieldMeta] of step.fields) {
        migrations += `        ${fieldName}: {\n`;
        migrations += `          derivedFrom: [${
          fieldMeta.derivedFrom.map(d => `"${d}"`).join(", ")
        }],\n`;
        migrations += `          forward: ${fieldMeta.forwardSource},\n`;
        if (fieldMeta.default !== undefined) {
          migrations += `          default: ${JSON.stringify(fieldMeta.default)},\n`;
        }
        migrations += `        },\n`;
      }
      migrations += `      },\n`;
      if (step.removedFields.length > 0) {
        migrations += `      removedFields: [${
          step.removedFields.map(f => `"${f}"`).join(", ")
        }],\n`;
      }
      migrations += `    },\n`;
    }
    migrations += `  ],\n`;

    migrations += `};\n\n`;
  }

  // Generate UnionMigrationRegistry entries for union models
  const latestSchema = chain[chain.length - 1]!.schema;
  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (item.type !== SchemaDefKind.UNION || !("variants" in item)) continue;
    const union = item as RuntimeSchemaUnion;

    migrations +=
      `export const ${exportName}Migrations: UnionMigrationRegistry<"${exportName}"> = {\n`;
    migrations += `  modelName: "${exportName}",\n`;
    migrations += `  discriminant: "${union.discriminant}",\n`;
    migrations += `  variants: {\n`;
    for (const [variantKey, variantField] of Object.entries(union.variants)) {
      if (
        variantField.type === "ref" && variantField.refType === "record"
        && variantField.name != null
      ) {
        // Find the export name for this record
        const variantExportName = findRecordExportName(variantField.name, latestSchema);
        if (variantExportName != null) {
          migrations += `    "${variantKey}": "${variantExportName}",\n`;
        }
      }
    }
    migrations += `  },\n`;
    migrations += `};\n\n`;
  }

  // --- Generate _internal/schema.ts ---
  let internalSchema = GENERATED_FILE_HEADER;
  internalSchema += `import { z } from "zod";\n\n`;

  for (const [exportName, model] of sortedEntries(allRecordModels)) {
    internalSchema += `export const ${exportName}InternalSchema = z.object({\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const zodType = convertTypeToZodSchema(fieldInfo.fieldType);
      // In internal schema, all fields that might be absent are optional
      if (fieldInfo.alwaysOptional) {
        // If the type already ends with .optional(), don't double-wrap
        if (zodType.endsWith(".optional()")) {
          internalSchema += `  ${fieldName}: ${zodType},\n`;
        } else {
          internalSchema += `  ${fieldName}: ${zodType}.optional(),\n`;
        }
      } else {
        internalSchema += `  ${fieldName}: ${zodType},\n`;
      }
    }

    internalSchema += `}).passthrough();\n\n`;
  }

  return { internalTypes, migrations, internalSchema };
}

/**
 * Helper to iterate sorted entries of a Map.
 */
function sortedEntries<V>(map: Map<string, V>): [string, V][] {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}
