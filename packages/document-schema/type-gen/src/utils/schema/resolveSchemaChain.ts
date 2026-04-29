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

import type { SchemaDefinition, VersionMigrations } from "@palantir/pack.schema";
import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { convertSchemaToIr } from "../steps/convertStepsToIr.js";

export interface VersionedIrEntry {
  version: number;
  ir: IRealTimeDocumentSchema;
  migrations?: VersionMigrations;
}

export interface ResolvedIrChain {
  chain: VersionedIrEntry[];
  latestVersion: number;
  minVersion: number;
}

function collectVersionedIrChain(input: SchemaDefinition): VersionedIrEntry[] {
  const chain: VersionedIrEntry[] = [];
  let current: SchemaDefinition = input;

  while (current.type === "versioned") {
    chain.unshift({
      version: current.version,
      ir: convertSchemaToIr(current.models, { version: current.version }),
      migrations: current.migrations,
    });
    current = current.previous;
  }
  chain.unshift({
    version: current.version,
    ir: convertSchemaToIr(current.models, { version: current.version }),
  });

  return chain;
}

/**
 * Collect the version chain and resolve min/latest versions.
 * Each version's models are converted to IR (IRealTimeDocumentSchema).
 * Throws on empty chain or invalid minSupportedVersion.
 */
export function resolveSchemaChain(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): ResolvedIrChain {
  const chain = collectVersionedIrChain(schema);

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
