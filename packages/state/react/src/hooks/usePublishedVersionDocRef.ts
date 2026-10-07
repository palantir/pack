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
  PublishedVersionRef,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useMemo } from "react";
import type { PublishedVersionLoadResult } from "./usePublishedVersionLoad.js";
import { usePublishedVersionLoad } from "./usePublishedVersionLoad.js";

export type UsePublishedVersionDocRefResult<D extends DocumentSchema = DocumentSchema> =
  & (
    | { readonly status: "liveDraft"; readonly docRef: DocumentRef<D>; readonly error?: undefined }
    | PublishedVersionLoadResult<D>
  )
  & {
    readonly refresh: () => void;
  };

/**
 * Returns the doc ref to render: the live draft when no version is requested, or the requested
 * published version, as a read-only `PublishedVersionDocumentRef`, once it loads.
 *
 * @param app The app instance initialized by your application.
 * @param liveDraftRef The live draft's doc ref.
 * @param publishedVersionRef The published version to show, or undefined for the live draft.
 *
 * @example
 * ```tsx
 * const liveDraftRef = useDocRef(app, DocumentModel, documentId);
 * const [versionRef, setVersionRef] = useState<PublishedVersionRef>();
 * const result = usePublishedVersionDocRef(app, liveDraftRef, versionRef);
 * if (result.docRef == null) {
 *   return result.error != null ? <ErrorMessage error={result.error} /> : <Spinner />;
 * }
 * return <Editor doc={result.docRef} readOnly={isPublishedVersionDocRef(result.docRef)} />;
 * ```
 */
export function usePublishedVersionDocRef<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  liveDraftRef: DocumentRef<D>,
  publishedVersionRef: PublishedVersionRef | undefined,
): UsePublishedVersionDocRefResult<D> {
  const { refresh, result } = usePublishedVersionLoad(app, liveDraftRef, publishedVersionRef);
  return useMemo<UsePublishedVersionDocRefResult<D>>(
    () =>
      publishedVersionRef == null
        ? { status: "liveDraft", docRef: liveDraftRef, refresh }
        : { ...result, refresh },
    [liveDraftRef, publishedVersionRef, refresh, result],
  );
}
