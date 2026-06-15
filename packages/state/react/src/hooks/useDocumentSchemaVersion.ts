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
 * Returns the document's schema operational version.
 *
 * This reflects the current loaded metadata. Foundry does not send metadata
 * update events for operational-version-only bumps, so this hook will not live
 * update for those changes.
 *
 * TODO: Revisit this hook when the backend evicts document subscribers on
 * operational version bumps and clients must refresh their document state.
 *
 * @param docRef The document reference to read the schema operational version from.
 * @returns The document's current schema operational version number.
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
      setVersion(metadata.operationalVersion ?? docRef.version);
    });
  }, [docRef]);

  return version;
}
