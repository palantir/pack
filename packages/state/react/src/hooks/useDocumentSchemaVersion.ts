/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
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

import type { DocumentRef, DocumentSchema } from "@palantir/pack.document-schema.model-types";

/**
 * Returns the schema version the document is currently operating at.
 *
 * This reads from the document's metadata (set by the backend), falling back
 * to minSupportedVersion from the schema if the metadata hasn't loaded yet.
 *
 * @param docRef The document reference to read the schema version from.
 * @returns The document's current operating schema version number.
 */
export function useDocumentSchemaVersion<D extends DocumentSchema>(
  docRef: DocumentRef<D>,
): number {
  return docRef.version;
}
