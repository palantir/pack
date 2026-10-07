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
import type { DocumentRef, DocumentSchema } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useCallback, useMemo, useState } from "react";
import type { PublishedVersionLoadResult } from "./usePublishedVersionLoad.js";
import { LATEST_PUBLISHED_VERSION, usePublishedVersionLoad } from "./usePublishedVersionLoad.js";

export type UseLatestPublishedVersionDocRefResult<D extends DocumentSchema = DocumentSchema> =
  & PublishedVersionLoadResult<D>
  & {
    /** Checks again which version is latest and loads it. */
    readonly refresh: () => void;
  };

/**
 * Loads a document's latest published version as a read-only `PublishedVersionDocumentRef`. It
 * checks which version is latest when it mounts, and again only when `refresh` is called or the
 * document changes, so it won't switch on its own when someone publishes. Status is `"error"` with
 * `NoActivePublishedVersion` when the document has none.
 *
 * @param app The app instance initialized by your application.
 * @param liveDraftRef The live draft's doc ref.
 *
 * @example
 * ```tsx
 * const liveDraftRef = useDocRef(app, DocumentModel, documentId);
 * const latest = useLatestPublishedVersionDocRef(app, liveDraftRef);
 * if (latest.docRef == null) {
 *   return latest.error != null ? <ErrorMessage error={latest.error} /> : <Spinner />;
 * }
 * return <Viewer doc={latest.docRef} />;
 * ```
 */
export function useLatestPublishedVersionDocRef<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  liveDraftRef: DocumentRef<D>,
): UseLatestPublishedVersionDocRefResult<D> {
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = useCallback(() => {
    setRefreshCount(count => count + 1);
  }, []);
  const result = usePublishedVersionLoad(app, liveDraftRef, LATEST_PUBLISHED_VERSION, refreshCount);
  return useMemo(() => ({ ...result, refresh }), [refresh, result]);
}
