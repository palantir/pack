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
import { collectVersionedSchemaChain } from "./runtimeSchema.js";

/**
 * Generate versions.ts from a versioned schema chain.
 *
 * Output:
 * ```
 * export type SupportedVersions = 1 | 2;
 * export type LatestVersion = 2;
 * export type MinSupportedVersion = 1;
 * ```
 */
export function generateVersionsFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): string {
  const chain = collectVersionedSchemaChain(schema);

  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;
  const minVersion = minSupportedVersion ?? latestVersion;

  const supportedVersions: number[] = [];
  for (const { version } of chain) {
    if (version >= minVersion) {
      supportedVersions.push(version);
    }
  }

  let output = GENERATED_FILE_HEADER;
  output += `export type SupportedVersions = ${supportedVersions.join(" | ")};\n`;
  output += `export type LatestVersion = ${latestVersion};\n`;
  output += `export type MinSupportedVersion = ${minVersion};\n`;

  return output;
}
