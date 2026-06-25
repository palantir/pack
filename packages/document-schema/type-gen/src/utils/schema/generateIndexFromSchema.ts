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

import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import type { ResolvedIrChain } from "./resolveSchemaChain.js";
import { resolveMinVersion } from "./resolveSchemaChain.js";
import {
  DOCUMENT_TYPE_PATH,
  INTERNAL_UPGRADE_FNS_PATH,
  MODELS_PATH,
  TYPES_REEXPORT_PATH,
  typesFilePath,
  VERSIONED_DOC_REF_PATH,
  versionedTypeName,
  VERSIONS_PATH,
} from "./runtimeSchema.js";

/**
 * Generate the index.ts barrel export from a versioned schema.
 *
 * Exports:
 * - `models.js` (star export — model constants and `DocumentModel`; emitted
 *   as a factory function when the schema has derived fields, otherwise a const)
 * - `types.js` (star export — latest-version type aliases)
 * - `versions.js` (star export — SupportedVersions, LatestVersion, MinSupportedVersion)
 * - `versionedDocRef.js` (star export — VersionedDocRef types and factory)
 * - `documentType.js` (star export — DOCUMENT_TYPE_NAME and DOCUMENT_TYPE_DESCRIPTION)
 * - `DocumentUpgradeFns` type (the typed shape the factory accepts)
 * - Per supported version: explicit named type exports from `types_vN.js`
 *   (not star exports, to avoid polluting autocomplete for read-only consumers)
 * - Per supported version: the union variant type guard *functions* from
 *   `types_vN.js` as values (e.g. `isFooBar_v1`), so consumers can narrow a
 *   union without re-deriving the discriminant check
 */
export function generateIndexFromChain(
  resolved: ResolvedIrChain,
  minSupportedVersion?: number,
): string {
  const { chain } = resolved;
  const { minVersion } = resolveMinVersion(chain, minSupportedVersion);

  let output = GENERATED_FILE_HEADER;

  // Star exports for core modules
  output += `export * from "${MODELS_PATH}";\n`;
  output += `export * from "${TYPES_REEXPORT_PATH}";\n`;
  output += `export * from "${VERSIONS_PATH}";\n`;
  output += `export * from "${VERSIONED_DOC_REF_PATH}";\n`;
  output += `export * from "${DOCUMENT_TYPE_PATH}";\n`;
  // The typed upgrade-function table shape. Apps reference this type when
  // constructing the value passed to `DocumentModel(...)`.
  output += `export { type DocumentUpgradeFns } from "${INTERNAL_UPGRADE_FNS_PATH}";\n`;

  // Per-version explicit named type exports
  for (const { version, ir } of chain) {
    if (version < minVersion) continue;

    const typeNames: string[] = [];
    // Union variant type guard functions (values, not types).
    const guardNames: string[] = [];

    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type === "record") {
        typeNames.push(versionedTypeName(modelKey, version));
      } else if (modelDef.type === "union") {
        typeNames.push(versionedTypeName(modelKey, version));

        // Union variant types and their generated `is<Variant>` guards.
        for (const variantName of Object.keys(modelDef.union.variants)) {
          const formattedVariant = formatVariantName(variantName);
          const variantTypeName = `${versionedTypeName(modelKey, version)}${formattedVariant}`;
          typeNames.push(variantTypeName);
          guardNames.push(`is${variantTypeName}`);
        }
      }
    }

    if (typeNames.length > 0) {
      output += `export type { ${typeNames.sort().join(", ")} } from "${
        typesFilePath(version)
      }";\n`;
    }

    if (guardNames.length > 0) {
      output += `export { ${guardNames.sort().join(", ")} } from "${typesFilePath(version)}";\n`;
    }
  }

  return output;
}
