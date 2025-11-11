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

import type { PackApp } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentMetadata,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseSearchDocumentsResult {
  isLoading: boolean;
  error: Error | undefined;
  results: ReadonlyArray<DocumentMetadata & { readonly id: DocumentId }> | undefined;
}

export function useSearchDocuments<T extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  documentTypeName: string,
  schema: T,
  documentName?: string,
  limit?: number,
): UseSearchDocumentsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [results, setResults] = useState<
    ReadonlyArray<DocumentMetadata & { readonly id: DocumentId }> | undefined
  >(undefined);

  const pendingRequestRef = useRef<number>(0);

  const search = useCallback(
    async (documentName?: string, limit?: number) => {
      const requestRef = ++pendingRequestRef.current;

      setIsLoading(true);
      setError(undefined);

      try {
        const searchResults = await app.state.searchDocuments(
          documentTypeName,
          schema,
          { documentName, limit },
        );
        if (requestRef === pendingRequestRef.current) {
          setResults(searchResults);
        }
      } catch (e) {
        if (requestRef === pendingRequestRef.current) {
          const error = e instanceof Error ? e : new Error("Failed to search documents");
          setError(error);
        }
      } finally {
        if (requestRef === pendingRequestRef.current) {
          setIsLoading(false);
        }
      }
    },
    [app.state, documentTypeName, schema],
  );

  useEffect(() => {
    void search(documentName, limit);
    return () => {
      // Invalidate pending requests on unmount or param change
      pendingRequestRef.current++;
    };
  }, [search]);

  return {
    error,
    isLoading,
    results,
  };
}
