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

// TODO: remove once @osdk/foundry.pack includes schema minor versions (api-gateway #18378).
// These add the minor-version fields api-gateway already accepts to the published types. The SDK
// sends request bodies as-is, so the extra fields reach the server.

import type {
  DocumentTypeAsset,
  SchemaMetadata,
  UpdateSchemaRequestBody,
  UpdateSchemaSuccess,
} from "@osdk/foundry.pack";

/** The minor version within a major schema version. */
export type SchemaMinorVersion = number;

export interface SchemaMetadataWithMinor extends SchemaMetadata {
  addedInMinorVersion?: SchemaMinorVersion;
  deprecatedFromMinorVersion?: SchemaMinorVersion;
}

export interface UpdateSchemaRequestBodyWithMinor extends UpdateSchemaRequestBody {
  schemaMinorVersion?: SchemaMinorVersion;
}

export interface UpdateSchemaSuccessWithMinor extends UpdateSchemaSuccess {
  /** Absent on stacks that predate minor versions. */
  schemaMinorVersion?: SchemaMinorVersion;
}

export interface DocumentTypeAssetWithMinor extends DocumentTypeAsset {
  schemaMinorVersion?: SchemaMinorVersion;
}

/** True for the error a stack returns until it can store minor versions. */
export function isSchemaMinorVersionNotSupported(error: unknown): boolean {
  return typeof error === "object"
    && error != null
    && (error as { errorName?: unknown }).errorName === "SchemaMinorVersionNotSupported";
}
