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
import { resolveSchemaChain } from "./resolveSchemaChain.js";
import {
  modelName,
  MODELS_PATH,
  typesFilePath,
  versionedTypeName,
  versionedWriteTypeName,
  writeTypesFilePath,
} from "./runtimeSchema.js";

/**
 * Generate versionedDocRef.ts from a versioned schema chain.
 *
 * Produces:
 * - Per-version VersionedDocRef_vN interfaces extending DocumentRef<DocumentModel>
 * - Union type VersionedDocRef = VersionedDocRef_v1 | VersionedDocRef_v2
 *
 * Every model gets a version-specific overload on every version so that
 * write data is always typed to the exact version, not the latest.
 */
export function generateScopeFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): string {
  const { chain, minVersion } = resolveSchemaChain(schema, minSupportedVersion);

  // Filter to supported versions
  const supportedVersions = chain.filter(v => v.version >= minVersion);

  // Collect all model names from the latest IR
  const latestIr = chain[chain.length - 1]!.ir;
  const allModelNames: string[] = [];
  for (const modelKey of Object.keys(latestIr.models)) {
    allModelNames.push(modelKey);
  }

  // Build output
  let output = GENERATED_FILE_HEADER;

  // Import model-types
  output +=
    `import type { DocumentRef, RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";\n`;

  // Import model types from models.ts
  const modelImports = allModelNames.map(n => modelName(n));
  const typeImportsFromModels = ["DocumentModel", ...modelImports];
  output += `import type { ${typeImportsFromModels.join(", ")} } from "${MODELS_PATH}";\n`;

  // Import per-version types
  for (const { version, ir } of supportedVersions) {
    const readTypeImports: string[] = [];
    const writeTypeImports: string[] = [];

    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type === "record") {
        readTypeImports.push(versionedTypeName(modelKey, version));
        writeTypeImports.push(versionedWriteTypeName(modelKey, version));
      } else if (modelDef.type === "union") {
        readTypeImports.push(versionedTypeName(modelKey, version));
      }
    }

    if (readTypeImports.length > 0) {
      output += `import type { ${readTypeImports.sort().join(", ")} } from "${
        typesFilePath(version)
      }";\n`;
    }
    if (writeTypeImports.length > 0) {
      output += `import type { ${writeTypeImports.sort().join(", ")} } from "${
        writeTypesFilePath(version)
      }";\n`;
    }
  }

  output += "\n";

  // Generate per-version VersionedDocRef interfaces extending DocumentRef.
  for (const { version, ir } of supportedVersions) {
    output += `export interface VersionedDocRef_v${version} extends DocumentRef<DocumentModel> {\n`;
    output += `  readonly version: ${version};\n`;

    // updateRecord overloads — record models get write types, union models get Partial<read>
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type === "record") {
        const writeType = versionedWriteTypeName(modelKey, version);
        output += `  updateRecord(ref: RecordRef<typeof ${
          modelName(modelKey)
        }>, data: ${writeType}): Promise<void>;\n`;
      } else if (modelDef.type === "union") {
        const readType = versionedTypeName(modelKey, version);
        output += `  updateRecord(ref: RecordRef<typeof ${
          modelName(modelKey)
        }>, data: Partial<${readType}>): Promise<void>;\n`;
      }
    }

    // setCollectionRecord overloads
    for (const [modelKey] of Object.entries(ir.models)) {
      const readType = versionedTypeName(modelKey, version);
      output += `  setCollectionRecord(model: typeof ${
        modelName(modelKey)
      }, id: RecordId, data: ${readType}): Promise<void>;\n`;
    }

    output += `}\n\n`;
  }

  // Union type
  if (supportedVersions.length === 1) {
    output += `export type VersionedDocRef = VersionedDocRef_v${supportedVersions[0]!.version};\n`;
  } else {
    const unionMembers = supportedVersions.map(v => `VersionedDocRef_v${v.version}`).join(" | ");
    output += `export type VersionedDocRef = ${unionMembers};\n`;
  }

  // asVersioned — identity cast to unlock version-specific write overloads
  output += `\n/** Narrow a DocumentRef to a version-discriminated type for type-safe writes. */\n`;
  output += `export function asVersioned(docRef: DocumentRef<DocumentModel>): VersionedDocRef {\n`;
  output += `  return docRef as VersionedDocRef;\n`;
  output += `}\n`;

  // matchVersion — exhaustive version handler
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
  output += `  switch (doc.version) {\n`;
  for (const { version } of supportedVersions) {
    output += `    case ${version}:\n`;
    output += `      return handlers[${version}](doc);\n`;
  }
  output += `    default:\n`;
  output += `      throw new Error(\`Unexpected document version: \${(doc as any).version}\`);\n`;
  output += `  }\n`;
  output += `}\n`;

  return output;
}
