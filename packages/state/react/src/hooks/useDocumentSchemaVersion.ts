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
import { getMetadata } from "@palantir/pack.document-schema.model-types";
import { useMemo } from "react";

/**
 * Returns the current schema version of the document.
 *
 * This is the primary branching point for developers writing transitional
 * clients that support multiple schema versions. The returned version
 * determines which per-version types and behavior the component should use.
 *
 * @param docRef The document reference to read the schema version from.
 * @returns The document's current schema version number.
 *
 * @example
 * ```tsx
 * import { useDocumentSchemaVersion, useDocRef } from "@palantir/pack.state.react";
 * import { DocumentModel } from "@myapp/schema";
 * import { app } from "./appInstance";
 *
 * const MyComponent: React.FC<{ documentId: string }> = ({ documentId }) => {
 *   const docRef = useDocRef(app, DocumentModel, documentId);
 *   const schemaVersion = useDocumentSchemaVersion(docRef);
 *
 *   if (schemaVersion === 1) {
 *     return <EditorV1 docRef={docRef} />;
 *   }
 *   return <EditorV2 docRef={docRef} />;
 * };
 * ```
 */
export function useDocumentSchemaVersion<D extends DocumentSchema>(
  docRef: DocumentRef<D>,
): number {
  return useMemo(
    () => getMetadata(docRef.schema).version,
    [docRef],
  );
}
