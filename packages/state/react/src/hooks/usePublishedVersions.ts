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
import type {
  DocumentId,
  DocumentRef,
  PublishedVersion,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useCallback, useEffect, useState } from "react";

export interface UsePublishedVersionsResult {
  readonly error: Error | undefined;
  readonly isLoading: boolean;
  /** Reloads the list, for example after publishing, or to pick up versions published elsewhere. */
  readonly refresh: () => void;
  /** The document's published versions, newest first. */
  readonly versions: readonly PublishedVersion[] | undefined;
}

interface LoadedVersions {
  readonly documentId: DocumentId;
  readonly error?: Error;
  readonly versions?: readonly PublishedVersion[];
}

/**
 * Loads a document's published versions, newest first. Call `refresh` after publishing or deleting
 * a version, or to pick up versions published elsewhere.
 *
 * @param app The app instance initialized by your application.
 * @param docRef The document, as its live draft or one of its published versions.
 */
export function usePublishedVersions(
  app: WithStateModule<PackApp>,
  docRef: DocumentRef,
): UsePublishedVersionsResult {
  const documentId = isValidDocRef(docRef) ? docRef.id : undefined;
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState<LoadedVersions>();
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => {
    setRefreshCount(count => count + 1);
  }, []);

  useEffect(() => {
    if (documentId == null) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void app.state.listPublishedVersions(docRef)
      .then(
        versions => {
          if (!cancelled) {
            setLoaded({ documentId, versions });
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setLoaded({
              documentId,
              error: e instanceof Error ? e : new Error("Failed to load published versions"),
            });
          }
        },
      )
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [app.state, docRef, documentId, refreshCount]);

  // Never return another document's versions.
  const current = loaded?.documentId === documentId ? loaded : undefined;
  return {
    error: current?.error,
    isLoading: documentId != null && isLoading,
    refresh,
    versions: current?.versions,
  };
}
