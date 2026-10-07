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

/** Which published version to load. */
export type PublishedVersionSelection =
  | { readonly type: "latest" }
  | { readonly type: "specific"; readonly publishedVersionRef: PublishedVersionRef };

type PublishedVersionStatus<D extends DocumentSchema> =
  | { readonly status: "idle"; readonly docRef?: undefined; readonly error?: undefined }
  | { readonly status: "loading"; readonly docRef?: undefined; readonly error?: undefined }
  | {
    readonly status: "loaded";
    readonly docRef: PublishedVersionDocumentRef<D>;
    readonly error?: undefined;
  }
  | { readonly status: "error"; readonly docRef?: undefined; readonly error: Error };

export type UsePublishedVersionDocRefResult<D extends DocumentSchema = DocumentSchema> =
  & PublishedVersionStatus<D>
  & {
    /** Loads again. The current result stays until the new one arrives. */
    readonly refresh: () => void;
  };

const LATEST = Symbol("latest");
const IDLE = { status: "idle" } as const;
const LOADING = { status: "loading" } as const;

interface Loaded<D extends DocumentSchema> {
  readonly liveDraftRef: DocumentRef<D>;
  readonly status: PublishedVersionStatus<D>;
  readonly version: PublishedVersionRef | typeof LATEST;
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
 * if (result.docRef == null) {
 *   return result.error != null ? <ErrorMessage error={result.error} /> : <Spinner />;
 * }
 * return <Viewer doc={result.docRef} />;
 * ```
 */
export function usePublishedVersionDocRef<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  liveDraftRef: DocumentRef<D>,
  selection: PublishedVersionSelection | undefined,
): UsePublishedVersionDocRefResult<D> {
  // A plain value, so an inline `selection` object doesn't reload on every render.
  const version = selection?.type === "latest" ? LATEST : selection?.publishedVersionRef;
  const [loaded, setLoaded] = useState<Loaded<D>>();
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = useCallback(() => {
    setRefreshCount(count => count + 1);
  }, []);

  // A new document or version starts empty, so coming back to one never shows its old result.
  useEffect(() => {
    setLoaded(undefined);
  }, [liveDraftRef, version]);

  useEffect(() => {
    if (version == null || !isValidDocRef(liveDraftRef)) {
      return;
    }

    let cancelled = false;
    const finish = (status: PublishedVersionStatus<D>) => {
      if (!cancelled) {
        setLoaded({ liveDraftRef, status, version });
      }
    };

    const load = version === LATEST
      ? app.state.loadLatestPublishedVersionDocRef(liveDraftRef)
      : app.state.loadPublishedVersionDocRef(liveDraftRef, version);
    load.then(
      publishedVersionDocRef => finish({ status: "loaded", docRef: publishedVersionDocRef }),
      (e: unknown) =>
        finish({
          status: "error",
          error: e instanceof Error ? e : new Error("Failed to load published version"),
        }),
    );

    return () => {
      cancelled = true;
    };
  }, [app.state, liveDraftRef, refreshCount, version]);

  // Ignore a result loaded for another document or version.
  const isCurrent = loaded?.liveDraftRef === liveDraftRef && loaded.version === version;
  const status = version == null || !isValidDocRef(liveDraftRef)
    ? IDLE
    : isCurrent
    ? loaded.status
    : LOADING;
  return useMemo(() => ({ ...status, refresh }), [refresh, status]);
}
