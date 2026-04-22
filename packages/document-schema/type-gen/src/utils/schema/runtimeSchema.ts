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

export function isRecordSchema(item: RuntimeSchemaItem): item is RuntimeSchemaRecord {
  return item.type === SchemaDefKind.RECORD && "fields" in item;
}

export function isUnionSchema(item: RuntimeSchemaItem): item is RuntimeSchemaUnion {
  return item.type === SchemaDefKind.UNION && "variants" in item;
}

export function collectVersionedSchemaChain(input: SchemaDefinition): VersionedSchemaEntry[] {
  const chain: VersionedSchemaEntry[] = [];
  let current: SchemaDefinition = input;

  while (current.type === "versioned") {
    chain.unshift({ version: current.version, schema: current.models as RuntimeSchema });
    current = current.previous;
  }
  chain.unshift({ version: current.version, schema: current.models as RuntimeSchema });

  return chain;
}
