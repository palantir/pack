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

import { formatVariantName } from "@palantir/pack.schema";

/** Versioned read type name: `RecordName_vN` */
export function versionedTypeName(exportName: string, version: number): string {
  return `${exportName}_v${version}`;
}

/** e.g. `NodeShape_v3` -> `KnownNodeShape_v3`: a union's variants without the Unknown case. */
export function knownTypeName(unionTypeName: string): string {
  return `Known${unionTypeName}`;
}

/** e.g. `NodeShape_v3` -> `narrowKnownNodeShape_v3`. */
export function narrowKnownFunctionName(unionTypeName: string): string {
  return `narrowKnown${unionTypeName}`;
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

/** Union variant name: (`Shape_v1`, `"my-box"`) -> `Shape_v1MyBox`. */
export function unionVariantName(unionName: string, variantKey: string): string {
  return `${unionName}${formatVariantName(variantKey)}`;
}

/** Type guard function name: `isShape_v1Circle` */
export function typeGuardName(typeName: string): string {
  return `is${typeName}`;
}

/** Upgrade registry constant name: `RecordNameUpgrades` */
export function upgradesName(modelKey: string): string {
  return `${modelKey}Upgrades`;
}

/** All-versions internal type name: `RecordName__Internal` */
export function internalTypeName(modelKey: string): string {
  return `${modelKey}__Internal`;
}

/** Per-version internal type name: `RecordName__vN` */
export function versionedInternalTypeName(modelKey: string, version: number): string {
  return `${modelKey}__v${version}`;
}

/** Internal Zod schema name: `RecordNameInternalSchema` */
export function internalSchemaName(modelKey: string): string {
  return `${modelKey}InternalSchema`;
}

/** Versioned document ref type name: `VersionedDocRef_vN` */
export function versionedDocRefName(version: number): string {
  return `VersionedDocRef_v${version}`;
}

/**
 * Names that share a file with a model's own name, so no model may produce one: the SDK's fixed
 * exports, and the names `models.ts` uses next to every model name it imports from `./types.js`.
 * Other library imports only sit next to suffixed names like `Foo_v1` or `FooModel`, so a model
 * can't clash with them and they aren't listed.
 */
export const RESERVED_SDK_NAMES: readonly string[] = [
  // Fixed SDK exports
  "DOCUMENT_TYPE_DESCRIPTION",
  "DOCUMENT_TYPE_NAME",
  "DocumentModel",
  "DocumentUpgradeFns",
  "LatestVersion",
  "MinSupportedVersion",
  "SupportedVersions",
  "VersionedDocRef",
  "asVersioned",
  "matchVersion",
  // Used in models.ts next to every model name: its model-types imports and the ReturnType global
  "DocumentSchema",
  "Metadata",
  "RecordModel",
  "ReturnType",
  "UnionModel",
  "UpgradeFns",
];

/** Per-version types file path: `./types_vN.js` */
export function typesFilePath(version: number): string {
  return `./types_v${version}.js`;
}

/** Per-version write types file path: `./writeTypes_vN.js` */
export function writeTypesFilePath(version: number): string {
  return `./writeTypes_v${version}.js`;
}

/** Types re-export file path: `./types.js` */
export const TYPES_REEXPORT_PATH = "./types.js";

/** Schema re-export file path: `./schema.js` */
export const SCHEMA_REEXPORT_PATH = "./schema.js";

/** Models file path: `./models.js` */
export const MODELS_PATH = "./models.js";

/** Internal upgrades file path: `./_internal/upgrades.js` */
export const INTERNAL_UPGRADES_PATH = "./_internal/upgrades.js";

/** Internal upgrade-functions file path: `./_internal/upgradeFns.js` */
export const INTERNAL_UPGRADE_FNS_PATH = "./_internal/upgradeFns.js";

/** Versions file path: `./versions.js` */
export const VERSIONS_PATH = "./versions.js";

/** Versioned doc ref file path: `./versionedDocRef.js` */
export const VERSIONED_DOC_REF_PATH = "./versionedDocRef.js";

/** Document type identity constants file path: `./documentType.js` */
export const DOCUMENT_TYPE_PATH = "./documentType.js";
