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

import { format } from "prettier";
import type { VersionedTypesOutput } from "../generateVersionedTypesFromSchema.js";

const prettierOpts = {
  parser: "typescript" as const,
  singleQuote: true,
  trailingComma: "es5" as const,
};

async function fmt(code: string): Promise<string> {
  return format(code, prettierOpts);
}

function section(filename: string, content: string): string {
  const bar = "=".repeat(60);
  return `// ${bar}\n// ${filename}\n// ${bar}\n\n${content}`;
}

/**
 * Combine a VersionedTypesOutput into a single snapshot string.
 *
 * Layout:
 *   // === types_v1.ts ===
 *   ...formatted code...
 *   // === writeTypes_v1.ts ===
 *   ...
 *   // === types.ts ===
 *   ...
 */
export async function formatVersionedTypesSnapshot(
  result: VersionedTypesOutput,
): Promise<string> {
  const sections: string[] = [];

  const sortedVersions = [...result.readTypes.keys()].sort((a, b) => a - b);

  for (const version of sortedVersions) {
    sections.push(section(`types_v${version}.ts`, await fmt(result.readTypes.get(version)!)));
  }
  for (const version of sortedVersions) {
    sections.push(section(`writeTypes_v${version}.ts`, await fmt(result.writeTypes.get(version)!)));
  }
  sections.push(section("types.ts", await fmt(result.typesReExport)));

  return sections.join("\n");
}

/**
 * Format a single generated string into a snapshot.
 */
export async function formatSingleSnapshot(
  filename: string,
  code: string,
): Promise<string> {
  return section(filename, await fmt(code));
}
