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

import type { DocumentRef, Model, RecordRef } from "@palantir/pack.document-schema.model-types";
import { useEffect, useMemo, useState } from "react";

const EMPTY_RECORD_REFS: readonly RecordRef[] = Object.freeze([]);

/**
 * Return refs for all records of a specific model in a document.
 * This may not always be desirable based on scale etc.
 */
export function useRecords<M extends Model>(
  doc: DocumentRef,
  modelSchema: M,
): readonly RecordRef<M>[] {
  // TODO: really the docRef/modelCollectionRefs should do their own memoization
  const collectionRef = useMemo(() => doc.getRecords(modelSchema), [doc, modelSchema]);
  const [recordRefs, setRecordRefs] = useState<readonly RecordRef<M>[]>(emptyRefs);

  useEffect(() => {
    setRecordRefs(emptyRefs());
  }, [collectionRef]);

  // Subscribe to changes on the collection ref to trigger re-renders.
  useEffect(() => {
    function refreshCollection() {
      // Maintain the insertion ordering from the recordCollection, otherwise we'd do a simpler set creation
      setRecordRefs([...collectionRef]);
    }

    const unsubscribeAdded = collectionRef.onItemsAdded(refreshCollection);
    const unsubscribeDeleted = collectionRef.onItemsDeleted(refreshCollection);

    refreshCollection();

    return () => {
      unsubscribeAdded();
      unsubscribeDeleted();
      setRecordRefs(emptyRefs());
    };
  }, [collectionRef]);

  return recordRefs;
}

function emptyRefs<R extends RecordRef>(): readonly R[] {
  return EMPTY_RECORD_REFS as readonly R[];
}
