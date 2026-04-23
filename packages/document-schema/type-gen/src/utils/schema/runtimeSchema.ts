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
import { TypeKind as SchemaTypeKind } from "@palantir/pack.schema";

export const TypeKind: typeof SchemaTypeKind & { readonly ANY: "any" } = {
  ...SchemaTypeKind,
  ANY: "any",
};

export const SchemaDefKind = {
  RECORD: "record",
  UNION: "union",
} as const;

// Runtime types mirroring the schema structure
export interface SchemaField {
  readonly type: string;
  readonly items?: SchemaField;
  readonly item?: SchemaField;
  readonly refType?: "record" | "union";
  readonly name?: string;
}

export interface RuntimeSchemaRecord {
  readonly type: typeof SchemaDefKind.RECORD;
  readonly name: string;
  readonly docs?: string;
  readonly fields: Readonly<Record<string, SchemaField>>;
}

export interface RuntimeSchemaUnion {
  readonly type: typeof SchemaDefKind.UNION;
  readonly name?: string;
  readonly variants: Readonly<Record<string, SchemaField>>;
  readonly discriminant: string;
}

export type RuntimeSchemaItem = RuntimeSchemaRecord | RuntimeSchemaUnion;
export type RuntimeSchema = Record<string, RuntimeSchemaItem>;

export interface VersionedSchemaEntry {
  version: number;
  schema: RuntimeSchema;
}
export interface ResolvedSchemaChain {
  chain: VersionedSchemaEntry[];
  latestVersion: number;
  minVersion: number;
}

/**
 * Collect the version chain and resolve min/latest versions.
 * Throws on empty chain or invalid minSupportedVersion.
 */
export function resolveSchemaChain(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): ResolvedSchemaChain {
  const chain = collectVersionedSchemaChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;

  if (minSupportedVersion != null && !chain.some(c => c.version === minSupportedVersion)) {
    throw new Error(
      `minSupportedVersion ${minSupportedVersion} is not in the schema chain `
        + `(available versions: ${chain.map(c => c.version).join(", ")})`,
    );
  }

  const minVersion = minSupportedVersion ?? latestVersion;

  return { chain, latestVersion, minVersion };
}

function collectVersionedSchemaChain(input: SchemaDefinition): VersionedSchemaEntry[] {
  const chain: VersionedSchemaEntry[] = [];
  let current: SchemaDefinition = input;

  while (current.type === "versioned") {
    chain.unshift({ version: current.version, schema: current.models as RuntimeSchema });
    current = current.previous;
  }
  chain.unshift({ version: current.version, schema: current.models as RuntimeSchema });

  return chain;
}

export function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
}

export function isUnionSchema(item: RuntimeSchemaItem): item is RuntimeSchemaUnion {
  return item.type === SchemaDefKind.UNION && "variants" in item;
}

export function findRecordExportName(recordName: string, schema: RuntimeSchema): string | null {
  for (const [exportName, item] of Object.entries(schema)) {
    if (isRecordSchema(item) && item.name === recordName) {
      return exportName;
    }
  }
  return null;
}

/** Versioned read type name: `RecordName_vN` */
export function versionedTypeName(exportName: string, version: number): string {
  return `${exportName}_v${version}`;
}

/** Versioned write type name: `RecordNameUpdate_vN` */
export function versionedWriteTypeName(exportName: string, version: number): string {
  return `${exportName}Update_v${version}`;
}

/** Versioned Zod schema name: `RecordNameSchema_vN` */
export function versionedSchemaName(exportName: string, version: number): string {
  return `${exportName}Schema_v${version}`;
}

/** Model constant name: `RecordNameModel` */
export function modelName(exportName: string): string {
  return `${exportName}Model`;
}

/** Unversioned Zod schema name: `RecordNameSchema` */
export function schemaName(exportName: string): string {
  return `${exportName}Schema`;
}

/** Per-version types file path: `./types_vN.js` */
export function typesFilePath(version: number): string {
  return `./types_v${version}.js`;
}

/** Per-version write types file path: `./writeTypes_vN.js` */
export function writeTypesFilePath(version: number): string {
  return `./writeTypes_v${version}.js`;
}
