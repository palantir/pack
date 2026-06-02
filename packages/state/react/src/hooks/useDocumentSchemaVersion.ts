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

import type { DocumentRef, DocumentSchema } from "@palantir/pack.document-schema.model-types";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useEffect, useState } from "react";

/**
 * Returns the schema version the document is currently operating at.
 *
 * Subscribes to metadata changes so callers update when the backend ratchets a
 * document to a new schema version.
 *
 * @param docRef The document reference to read the schema version from.
 * @returns The document's current operating schema version number.
 */
export function useDocumentSchemaVersion<D extends DocumentSchema>(
  docRef: DocumentRef<D>,
): number {
  const [version, setVersion] = useState(() => docRef.version);

  useEffect(() => {
    setVersion(docRef.version);

    if (!isValidDocRef(docRef)) {
      return;
    }

    return docRef.onMetadataChange((_docRef, metadata) => {
      setVersion(metadata.schemaVersion ?? docRef.version);
    });
  }, [docRef]);

  return version;
}
