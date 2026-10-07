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
  DocumentRef,
  DocumentSchema,
  PublishedVersionDocumentRef,
  PublishedVersionRef,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PublishedVersionSelection =
  | { readonly type: "latest" }
  | { readonly type: "specific"; readonly publishedVersionRef: PublishedVersionRef };

type PublishedVersionLoadState<D extends DocumentSchema> =
  | {
    readonly status: "idle" | "loading";
    readonly publishedVersionDocRef?: undefined;
    readonly error?: undefined;
  }
  | {
    readonly status: "loaded";
    readonly publishedVersionDocRef: PublishedVersionDocumentRef<D>;
    readonly error?: undefined;
  }
  | {
    readonly status: "error";
    readonly publishedVersionDocRef?: undefined;
    readonly error: Error;
  };

export type UsePublishedVersionDocRefResult<D extends DocumentSchema = DocumentSchema> =
  & PublishedVersionLoadState<D>
  & {
    readonly refresh: () => void;
  };

const LATEST = Symbol("latest");
const IDLE = { status: "idle" } as const;
const LOADING = { status: "loading" } as const;

interface LoadResult<D extends DocumentSchema> {
  readonly liveDraftRef: DocumentRef<D>;
  readonly state: PublishedVersionLoadState<D>;
  readonly selectionKey: PublishedVersionRef | typeof LATEST;
}

/**
 * Loads a published version as a read-only `PublishedVersionDocumentRef`. For `"latest"`, it checks
 * which version is latest only on mount, on `refresh`, or when the document changes, so it won't
 * switch on its own when someone publishes. Status is `"idle"`, with no doc ref, when `selection`
 * is undefined or `liveDraftRef` is invalid.
 *
 * @param app The app instance initialized by your application.
 * @param liveDraftRef The live draft's doc ref.
 * @param selection The published version to load, or undefined to load nothing.
 *
 * @example
 * ```tsx
 * const liveDraftRef = useDocRef(app, DocumentModel, documentId);
 * const result = usePublishedVersionDocRef(app, liveDraftRef, { type: "latest" });
 * if (result.publishedVersionDocRef == null) {
 *   return result.error != null ? <ErrorMessage error={result.error} /> : <Spinner />;
 * }
 * return <Viewer doc={result.publishedVersionDocRef} />;
 * ```
 */
export function usePublishedVersionDocRef<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  liveDraftRef: DocumentRef<D>,
  selection: PublishedVersionSelection | undefined,
): UsePublishedVersionDocRefResult<D> {
  const selectionKey = selection?.type === "latest" ? LATEST : selection?.publishedVersionRef;
  const [loadResult, setLoadResult] = useState<LoadResult<D>>();
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = useCallback(() => {
    setRefreshCount(count => count + 1);
  }, []);

  // A new document or selection starts empty, so coming back to one never shows its old result.
  useEffect(() => {
    setLoadResult(undefined);
  }, [liveDraftRef, selectionKey]);

  useEffect(() => {
    if (selectionKey == null || !isValidDocRef(liveDraftRef)) {
      return;
    }

    let cancelled = false;
    const finish = (nextState: PublishedVersionLoadState<D>) => {
      if (!cancelled) {
        setLoadResult({ liveDraftRef, selectionKey, state: nextState });
      }
    };

    (selectionKey === LATEST
      ? app.state.loadLatestPublishedVersionDocRef(liveDraftRef)
      : app.state.loadPublishedVersionDocRef(liveDraftRef, selectionKey)).then(
        publishedVersionDocRef => finish({ status: "loaded", publishedVersionDocRef }),
        (e: unknown) =>
          finish({
            status: "error",
            error: e instanceof Error ? e : new Error("Failed to load published version"),
          }),
      );

    return () => {
      cancelled = true;
    };
  }, [app.state, liveDraftRef, refreshCount, selectionKey]);

  // Ignore a result loaded for another document or selection.
  const isCurrent = loadResult?.liveDraftRef === liveDraftRef
    && loadResult.selectionKey === selectionKey;
  const state = selectionKey == null || !isValidDocRef(liveDraftRef)
    ? IDLE
    : isCurrent
    ? loadResult.state
    : LOADING;
  return useMemo(() => ({ ...state, refresh }), [refresh, state]);
}
