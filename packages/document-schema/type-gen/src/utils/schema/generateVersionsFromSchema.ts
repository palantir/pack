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
import type { ResolvedIrChain } from "./resolveSchemaChain.js";
import { resolveMinVersion, resolveSchemaChain } from "./resolveSchemaChain.js";

/**
 * Generate versions.ts from an already-resolved versioned IR chain.
 *
 * Output:
 * ```
 * export type SupportedVersions = 1 | 2;
 * export type LatestVersion = 2;
 * export type MinSupportedVersion = 1;
 * ```
 */
export function generateVersionsFromChain(
  resolved: ResolvedIrChain,
  minSupportedVersion?: number,
): string {
  const { chain } = resolved;
  const { latestVersion, minVersion } = resolveMinVersion(chain, minSupportedVersion);

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

export function generateVersionsFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): string {
  return generateVersionsFromChain(
    resolveSchemaChain(schema, minSupportedVersion),
    minSupportedVersion,
  );
}
