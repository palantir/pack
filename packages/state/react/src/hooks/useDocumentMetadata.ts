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

import type {
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useEffect, useState } from "react";

interface ReturnType {
  isMetadataLoading: boolean;
  metadata: DocumentMetadata | undefined;
}

export function useDocumentMetadata<D extends DocumentSchema>(
  docRef: DocumentRef<D>,
): ReturnType {
  const [metadata, setMetadata] = useState<DocumentMetadata>();

  useEffect(() => {
    setMetadata(undefined);

    if (!isValidDocRef(docRef)) {
      return;
    }

    // TODO: much more sensible upstream loading state

    const unsubMetdata = docRef.onMetadataChange((_docRef, metadata) => {
      setMetadata(metadata);
    });

    return () => {
      unsubMetdata();
      setMetadata(undefined);
    };
  }, [docRef]);

  return { isMetadataLoading: metadata == null, metadata };
}
