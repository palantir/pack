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

const __schemaVersion = Symbol.for("__schemaVersion");
const __previousSchema = Symbol.for("__previousSchema");

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

interface VersionedSchema {
  version: number;
  schema: RuntimeSchema;
}

function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
}

function isUnionSchema(item: RuntimeSchemaItem): item is RuntimeSchemaUnion {
  return item.type === SchemaDefKind.UNION && "variants" in item;
}

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
 * Compare field sets between two record definitions.
 * Returns true if any field was added, removed, or the set differs.
 */
function recordFieldsChanged(
  prev: RuntimeSchemaRecord | undefined,
  curr: RuntimeSchemaRecord,
): boolean {
  if (prev == null) return true; // new model — treat as changed
  const prevFields = Object.keys(prev.fields).sort().join(",");
  const currFields = Object.keys(curr.fields).sort().join(",");
  return prevFields !== currFields;
}

/**
 * For a union, check if any of its record variants reference changed models.
 */
function unionReferencesChangedModel(
  union: RuntimeSchemaUnion,
  changedRecordNames: Set<string>,
  schema: RuntimeSchema,
): boolean {
  for (const variantField of Object.values(union.variants)) {
    if (variantField.type === "ref" && variantField.refType === "record") {
      const exportName = findRecordExportName(variantField.name!, schema);
      if (exportName != null && changedRecordNames.has(exportName)) {
        return true;
      }
    }
  }
  return false;
}

function findRecordExportName(recordName: string, schema: RuntimeSchema): string | null {
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item) && item.name === recordName) {
      return exportName;
    }
  }
  return null;
}

/**
 * Determine which record models changed between two adjacent schema versions.
 * Returns the set of export names (e.g. "ShapeBox") that changed.
 */
function getChangedRecordModels(
  prev: RuntimeSchema | undefined,
  curr: RuntimeSchema,
): Set<string> {
  const changed = new Set<string>();

  for (const [exportName, item] of Object.entries(curr)) {
    if (!isRecordSchema(item)) continue;
    const prevItem = prev?.[exportName];
    const prevRecord = prevItem != null && isRecordSchema(prevItem) ? prevItem : undefined;
    if (recordFieldsChanged(prevRecord, item)) {
      changed.add(exportName);
    }
  }

  return changed;
}

function versionedTypeName(exportName: string, version: number): string {
  return `${exportName}_v${version}`;
}

function versionedWriteTypeName(exportName: string, version: number): string {
  return `${exportName}Update_v${version}`;
}

/**
 * Generate versionedDocRef.ts from a versioned schema chain.
 *
 * Produces:
 * - Per-version VersionedDocRef_vN interfaces extending DocumentRef<DocumentModel>
 * - Union type VersionedDocRef = VersionedDocRef_v1 | VersionedDocRef_v2
 * - createVersionedDocRef factory function
 *
 * The generated type extends DocumentRef so it can be used anywhere a DocumentRef
 * is expected (reads, subscriptions, etc.) while adding version-specific overloads
 * for write operations (updateRecord, setCollectionRecord, deleteRecord).
 *
 * Consumers narrow writes via `switch (doc.version)` — no React context needed.
 */
export function generateScopeFromSchema(
  schema: ReturnedSchema,
  minSupportedVersion?: number,
): string {
  const runtimeSchema = schema as unknown as RuntimeSchema;
  const chain = collectVersionChain(runtimeSchema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;
  const minVersion = minSupportedVersion ?? latestVersion;

  // Filter to supported versions
  const supportedVersions = chain.filter(v => v.version >= minVersion);

  // Collect all model names from the latest schema
  const latestSchema = chain[chain.length - 1]!.schema;
  const allRecordNames: string[] = [];
  const allUnionNames: string[] = [];
  const allModelNames: string[] = [];
  for (const [exportName, item] of Object.entries(latestSchema)) {
    if (isRecordSchema(item)) {
      allRecordNames.push(exportName);
      allModelNames.push(exportName);
    } else if (isUnionSchema(item)) {
      allUnionNames.push(exportName);
      allModelNames.push(exportName);
    }
  }

  // For each supported version, determine which models changed relative to previous
  const changedModelsPerVersion = new Map<number, Set<string>>();
  for (let i = 0; i < supportedVersions.length; i++) {
    const curr = supportedVersions[i]!;
    const chainIdx = chain.findIndex(v => v.version === curr.version);
    const prev = chainIdx > 0 ? chain[chainIdx - 1] : undefined;
    const changedRecords = getChangedRecordModels(prev?.schema, curr.schema);

    // Also include unions that reference changed records
    const changedModels = new Set(changedRecords);
    for (const [exportName, item] of Object.entries(curr.schema)) {
      if (isUnionSchema(item) && unionReferencesChangedModel(item, changedRecords, curr.schema)) {
        changedModels.add(exportName);
      }
    }

    changedModelsPerVersion.set(curr.version, changedModels);
  }

  // Build output
  let output = GENERATED_FILE_HEADER;

  // Import model-types
  output +=
    `import type { DocumentRef, Model, ModelData, RecordCollectionRef, RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";\n`;
  output += `import { getMetadata } from "@palantir/pack.document-schema.model-types";\n`;

  // Import DocumentModel type
  output += `import type { DocumentModel } from "./models.js";\n`;

  // Import model constants from models.ts
  const modelImports = allModelNames.map(n => `${n}Model`);
  if (modelImports.length > 0) {
    output += `import type { ${modelImports.join(", ")} } from "./models.js";\n`;
  }

  // Import per-version types
  for (const { version } of supportedVersions) {
    const versionSchema = chain.find(v => v.version === version)!.schema;
    const readTypeImports: string[] = [];
    const writeTypeImports: string[] = [];

    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (isRecordSchema(item)) {
        readTypeImports.push(versionedTypeName(exportName, version));
        writeTypeImports.push(versionedWriteTypeName(exportName, version));
      } else if (isUnionSchema(item)) {
        // Import union read types for setCollectionRecord overloads
        readTypeImports.push(versionedTypeName(exportName, version));
      }
    }

    if (readTypeImports.length > 0) {
      output += `import type { ${
        readTypeImports.sort().join(", ")
      } } from "./types_v${version}.js";\n`;
    }
    if (writeTypeImports.length > 0) {
      output += `import type { ${
        writeTypeImports.sort().join(", ")
      } } from "./writeTypes_v${version}.js";\n`;
    }
  }

  // Import SupportedVersions
  output += `import type { SupportedVersions } from "./versions.js";\n`;

  output += "\n";

  // Generate per-version VersionedDocRef interfaces
  for (const { version, schema: versionSchema } of supportedVersions) {
    const changed = changedModelsPerVersion.get(version) ?? new Set<string>();

    output += `export interface VersionedDocRef_v${version} extends DocumentRef<DocumentModel> {\n`;
    output += `  readonly version: ${version};\n`;

    // updateRecord overloads — record models get write types, union models get Partial
    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (!changed.has(exportName)) continue;

      if (isRecordSchema(item)) {
        const writeType = versionedWriteTypeName(exportName, version);
        output +=
          `  updateRecord(ref: RecordRef<typeof ${exportName}Model>, data: ${writeType}): void;\n`;
      } else if (isUnionSchema(item)) {
        const readType = versionedTypeName(exportName, version);
        output +=
          `  updateRecord(ref: RecordRef<typeof ${exportName}Model>, data: Partial<${readType}>): void;\n`;
      }
    }
    output +=
      `  updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): void;\n`;

    // setCollectionRecord overloads — for changed records AND unions
    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (!changed.has(exportName)) continue;

      const readType = versionedTypeName(exportName, version);
      output +=
        `  setCollectionRecord(model: typeof ${exportName}Model, id: RecordId, data: ${readType}): void;\n`;
    }
    output +=
      `  setCollectionRecord<M extends Model>(model: M, id: RecordId, data: ModelData<M>): void;\n`;

    // deleteRecord
    output += `  deleteRecord<M extends Model>(ref: RecordRef<M>): void;\n`;

    output += `}\n\n`;
  }

  // Union type
  if (supportedVersions.length === 1) {
    output += `export type VersionedDocRef = VersionedDocRef_v${supportedVersions[0]!.version};\n`;
  } else {
    const unionMembers = supportedVersions.map(v => `VersionedDocRef_v${v.version}`).join(" | ");
    output += `export type VersionedDocRef = ${unionMembers};\n`;
  }

  // Factory function
  output +=
    `\nexport function createVersionedDocRef(docRef: DocumentRef<DocumentModel>): VersionedDocRef {\n`;
  output += `  const version = getMetadata(docRef.schema).version as SupportedVersions;\n`;
  output += `  const ref = Object.create(docRef) as VersionedDocRef;\n`;
  output += `  Object.defineProperties(ref, {\n`;
  output += `    version: { value: version, enumerable: true },\n`;
  output += `    updateRecord: {\n`;
  output +=
    `      value: (recordRef: RecordRef, data: unknown) => recordRef.update(data as any),\n`;
  output += `    },\n`;
  output += `    setCollectionRecord: {\n`;
  output += `      value: (model: Model, id: RecordId, data: unknown) => {\n`;
  output += `        const collection: RecordCollectionRef = docRef.getRecords(model);\n`;
  output += `        return collection.set(id, data as any);\n`;
  output += `      },\n`;
  output += `    },\n`;
  output += `    deleteRecord: {\n`;
  output += `      value: (recordRef: RecordRef) => recordRef.delete(),\n`;
  output += `    },\n`;
  output += `  });\n`;
  output += `  return ref;\n`;
  output += `}\n`;

  return output;
}
