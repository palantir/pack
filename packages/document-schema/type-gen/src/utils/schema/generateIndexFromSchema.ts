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

const SchemaDefKind = {
  RECORD: "record",
  UNION: "union",
} as const;

interface RuntimeSchemaRecord {
  readonly type: typeof SchemaDefKind.RECORD;
  readonly name: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface RuntimeSchemaUnion {
  readonly type: typeof SchemaDefKind.UNION;
  readonly name?: string;
  readonly variants: Readonly<Record<string, unknown>>;
  readonly discriminant: string;
}

type RuntimeSchemaItem = RuntimeSchemaRecord | RuntimeSchemaUnion;
type RuntimeSchema = Record<string, RuntimeSchemaItem>;

interface VersionedSchemaEntry {
  version: number;
  schema: RuntimeSchema;
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

function formatVariantName(variantName: string): string {
  return variantName.charAt(0).toUpperCase() + variantName.slice(1);
}

function versionedTypeName(exportName: string, version: number): string {
  return `${exportName}_v${version}`;
}

/**
 * Generate the index.ts barrel export from a versioned schema.
 *
 * Exports:
 * - `models.js` (star export — model constants and DocumentModel)
 * - `types.js` (star export — latest-version type aliases)
 * - `versions.js` (star export — SupportedVersions, LatestVersion, MinSupportedVersion)
 * - `versionedDocRef.js` (star export — VersionedDocRef types and factory)
 * - Per supported version: explicit named type exports from `types_vN.js`
 *   (not star exports, to avoid polluting autocomplete for read-only consumers)
 */
export function generateIndexFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): string {
  const chain = collectVersionChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;
  const minVersion = minSupportedVersion ?? latestVersion;

  let output = GENERATED_FILE_HEADER;

  // Star exports for core modules
  output += `export * from "./models.js";\n`;
  output += `export * from "./types.js";\n`;
  output += `export * from "./versions.js";\n`;
  output += `export * from "./versionedDocRef.js";\n`;

  // Per-version explicit named type exports
  for (const { version, schema: versionSchema } of chain) {
    if (version < minVersion) continue;

    const typeNames: string[] = [];

    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (isRecordSchema(item)) {
        typeNames.push(versionedTypeName(exportName, version));
      } else if (isUnionSchema(item)) {
        typeNames.push(versionedTypeName(exportName, version));

        // Union variant types
        for (const variantName of Object.keys(item.variants)) {
          const formattedVariant = formatVariantName(variantName);
          typeNames.push(`${versionedTypeName(exportName, version)}${formattedVariant}`);
        }
      }
    }

    if (typeNames.length > 0) {
      output += `export type { ${typeNames.sort().join(", ")} } from "./types_v${version}.js";\n`;
    }
  }

  return output;
}
