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

import type { PackApp } from "@palantir/pack.core";
import type { DocumentType, WithStateModule } from "@palantir/pack.state.core";
import { useEffect, useState } from "react";

interface UseDocumentTypeMetadataResult {
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  /** Result of loadDocumentTypeByName (includes the operational version). */
  readonly documentType: DocumentType | undefined;
}

/**
 * Loads metadata for a document type by name via loadDocumentTypeByName. The lookup is scoped to
 * the app's bound ontology, since a document type name is only unique within an ontology.
 */
export function useDocumentTypeMetadata(
  app: WithStateModule<PackApp>,
  documentTypeName: string,
): UseDocumentTypeMetadataResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [documentType, setDocumentType] = useState<DocumentType | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(undefined);

    void app.state.loadDocumentTypeByName(documentTypeName)
      .then(loadedDocumentType => {
        if (!cancelled) {
          setDocumentType(loadedDocumentType);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error("Failed to load document type"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [app.state, documentTypeName]);

  return {
    documentType,
    error,
    isLoading,
  };
}
