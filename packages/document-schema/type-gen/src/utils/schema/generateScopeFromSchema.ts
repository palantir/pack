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
import { setIsEqual } from "../sets.js";
import type { RuntimeSchema, RuntimeSchemaRecord, RuntimeSchemaUnion } from "./runtimeSchema.js";
import { collectVersionedSchemaChain, isRecordSchema, isUnionSchema } from "./runtimeSchema.js";

/**
 * Compare field sets between two record definitions.
 * Returns true if any field was added, removed, or the set differs.
 */
function recordFieldsChanged(
  prev: RuntimeSchemaRecord | undefined,
  curr: RuntimeSchemaRecord,
): boolean {
  if (prev == null) {
    // new model -- treat as changed
    return true;
  }
  const prevFields = new Set(Object.keys(prev.fields));
  const currFields = new Set(Object.keys(curr.fields));
  return !setIsEqual(prevFields, currFields);
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
 * Consumers narrow writes via `switch (doc.version)` -- no React context needed.
 */
export function generateScopeFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): string {
  const chain = collectVersionedSchemaChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  if (
    minSupportedVersion != null && !chain.find(({ version }) => version === minSupportedVersion)
  ) {
    throw new Error(
      `minSupportedVersion ${minSupportedVersion} is not in the schema chain `
        + `(available versions: ${chain.map(c => c.version).join(", ")})`,
    );
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
    `import type { DocumentRef, Model, ModelData, RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";\n`;

  // Import model types from models.ts
  const modelImports = allModelNames.map(n => `${n}Model`);
  const typeImportsFromModels = ["DocumentModel", ...modelImports];
  output += `import type { ${typeImportsFromModels.join(", ")} } from "./models.js";\n`;

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

  output += "\n";

  // Generate per-version VersionedDocRef interfaces extending DocumentRef
  for (const { version, schema: versionSchema } of supportedVersions) {
    const changed = changedModelsPerVersion.get(version) ?? new Set<string>();

    output += `export interface VersionedDocRef_v${version} extends DocumentRef<DocumentModel> {\n`;
    output += `  readonly version: ${version};\n`;

    // updateRecord overloads -- record models get write types, union models get Partial
    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (!changed.has(exportName)) continue;

      if (isRecordSchema(item)) {
        const writeType = versionedWriteTypeName(exportName, version);
        output +=
          `  updateRecord(ref: RecordRef<typeof ${exportName}Model>, data: ${writeType}): Promise<void>;\n`;
      } else if (isUnionSchema(item)) {
        const readType = versionedTypeName(exportName, version);
        output +=
          `  updateRecord(ref: RecordRef<typeof ${exportName}Model>, data: Partial<${readType}>): Promise<void>;\n`;
      }
    }
    output +=
      `  updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): Promise<void>;\n`;

    // setCollectionRecord overloads -- for changed records AND unions
    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (!changed.has(exportName)) continue;

      const readType = versionedTypeName(exportName, version);
      output +=
        `  setCollectionRecord(model: typeof ${exportName}Model, id: RecordId, data: ${readType}): Promise<void>;\n`;
    }
    output +=
      `  setCollectionRecord<M extends Model>(model: M, id: RecordId, data: ModelData<M>): Promise<void>;\n`;

    output += `}\n\n`;
  }

  // Union type
  if (supportedVersions.length === 1) {
    output += `export type VersionedDocRef = VersionedDocRef_v${supportedVersions[0]!.version};\n`;
  } else {
    const unionMembers = supportedVersions.map(v => `VersionedDocRef_v${v.version}`).join(" | ");
    output += `export type VersionedDocRef = ${unionMembers};\n`;
  }

  // asVersioned -- identity cast to unlock version-specific write overloads
  output += `\n/** Narrow a DocumentRef to a version-discriminated type for type-safe writes. */\n`;
  output += `export function asVersioned(docRef: DocumentRef<DocumentModel>): VersionedDocRef {\n`;
  output += `  return docRef as VersionedDocRef;\n`;
  output += `}\n`;

  // matchVersion -- exhaustive version handler
  const handlerProps = supportedVersions.map(
    v => `  readonly ${v.version}: (doc: VersionedDocRef_v${v.version}) => R;`,
  ).join("\n");

  output += `\n/**\n`;
  output += ` * Exhaustive version handler. TypeScript enforces that every supported\n`;
  output += ` * version has a corresponding handler -- adding a new schema version\n`;
  output += ` * produces a compile error at every call site until handled.\n`;
  output += ` */\n`;
  output += `export function matchVersion<R>(\n`;
  output += `  doc: VersionedDocRef,\n`;
  output += `  handlers: {\n`;
  output += handlerProps + "\n";
  output += `  },\n`;
  output += `): R {\n`;
  output +=
    `  return (handlers as Record<number, (doc: VersionedDocRef) => R>)[doc.version]!(doc);\n`;
  output += `}\n`;

  return output;
}
