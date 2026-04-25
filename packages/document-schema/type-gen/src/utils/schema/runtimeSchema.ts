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

/** Types re-export file path: `./types.js` */
export const TYPES_REEXPORT_PATH = "./types.js";

/** Schema re-export file path: `./schema.js` */
export const SCHEMA_REEXPORT_PATH = "./schema.js";

/** Models file path: `./models.js` */
export const MODELS_PATH = "./models.js";

/** Internal upgrades file path: `./_internal/upgrades.js` */
export const INTERNAL_UPGRADES_PATH = "./_internal/upgrades.js";

/** Versions file path: `./versions.js` */
export const VERSIONS_PATH = "./versions.js";

/** Versioned doc ref file path: `./versionedDocRef.js` */
export const VERSIONED_DOC_REF_PATH = "./versionedDocRef.js";
