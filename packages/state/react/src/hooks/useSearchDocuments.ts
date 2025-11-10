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
import type { DocumentRef, DocumentSchema } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useCallback, useEffect, useState } from "react";

interface SearchOptions {
  documentName?: string;
  limit?: number;
}

interface UseSearchDocumentsResult<T extends DocumentSchema> {
  isLoading: boolean;
  error: Error | undefined;
  results: Array<DocumentRef<T>> | undefined;
  search: (options?: SearchOptions) => Promise<void>;
}

export function useSearchDocuments<T extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  documentTypeName: string,
  schema: T,
  autoSearch: boolean = false,
  initialOptions?: SearchOptions,
): UseSearchDocumentsResult<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [results, setResults] = useState<Array<DocumentRef<T>> | undefined>(undefined);

  const search = useCallback(
    async (options?: SearchOptions) => {
      if (!app.state.searchDocuments) {
        setError(new Error("searchDocuments is not supported by this document service"));
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const searchResults = await app.state.searchDocuments(
          documentTypeName,
          schema,
          options,
        );
        setResults(searchResults);
      } catch (e) {
        const error = e instanceof Error ? e : new Error("Failed to search documents");
        setError(error);
      } finally {
        setIsLoading(false);
      }
    },
    [app.state, documentTypeName, schema],
  );

  useEffect(() => {
    if (autoSearch) {
      void search(initialOptions);
    }
  }, [autoSearch, initialOptions, search]);

  return {
    error,
    isLoading,
    results,
    search,
  };
}
