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

const SchemaDefKind = { RECORD: "record", UNION: "union" } as const;

interface RuntimeSchemaRecord {
  readonly type: typeof SchemaDefKind.RECORD;
  readonly name: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

type RuntimeSchemaItem = RuntimeSchemaRecord | { readonly type: string };
type RuntimeSchema = Record<string, RuntimeSchemaItem>;

interface VersionedSchemaEntry {
  version: number;
  schema: RuntimeSchema;
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

export interface SchemaManifest {
  latestVersion: number;
  versions: Record<number, VersionManifest>;
}

export interface VersionManifest {
  version: number;
  models: Record<string, ModelManifest>;
}

export interface ModelManifest {
  fields: string[];
}

/**
 * Generate a schema manifest for the backend. Contains per-version field lists
 * for each model, enabling the backend to validate writes and compute compatibility.
 */
export function generateSchemaManifest(
  schema: SchemaDefinition,
): SchemaManifest {
  const chain = collectVersionChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const versions: Record<number, VersionManifest> = {};

  for (const { version, schema: versionSchema } of chain) {
    const models: Record<string, ModelManifest> = {};

    for (const [exportName, item] of Object.entries(versionSchema)) {
      if (item.type === SchemaDefKind.RECORD && "fields" in item) {
        const record = item as RuntimeSchemaRecord;
        models[exportName] = {
          fields: Object.keys(record.fields).sort(),
        };
      }
    }

    versions[version] = { version, models };
  }

  return {
    latestVersion: chain[chain.length - 1]!.version,
    versions,
  };
}
