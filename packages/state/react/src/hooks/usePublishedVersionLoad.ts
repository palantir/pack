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
import { useEffect, useState } from "react";

export type PublishedVersionLoadResult<D extends DocumentSchema = DocumentSchema> =
  | { readonly status: "loading"; readonly docRef?: undefined; readonly error?: undefined }
  | {
    readonly status: "loaded";
    readonly docRef: PublishedVersionDocumentRef<D>;
    readonly error?: undefined;
  }
  | { readonly status: "error"; readonly docRef?: undefined; readonly error: Error };

/** Pass as the version to load the latest published version. */
export const LATEST_PUBLISHED_VERSION: unique symbol = Symbol("latest published version");

const LOADING = { status: "loading" } as const;

interface Loaded<D extends DocumentSchema> {
  readonly attempt: number;
  readonly liveDraftRef: DocumentRef<D>;
  readonly result: PublishedVersionLoadResult<D>;
  readonly version: PublishedVersionRef | typeof LATEST_PUBLISHED_VERSION;
}

/**
 * Loads a published version as a read-only doc ref. Shared by the published version doc ref hooks.
 * Shows loading whenever the request changes, and ignores results for an older request. Changing
 * `attempt` loads again with the same inputs.
 */
export function usePublishedVersionLoad<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  liveDraftRef: DocumentRef<D>,
  version: PublishedVersionRef | typeof LATEST_PUBLISHED_VERSION | undefined,
  attempt = 0,
): PublishedVersionLoadResult<D> {
  const [loaded, setLoaded] = useState<Loaded<D>>();

  useEffect(() => {
    setLoaded(undefined);
    if (version == null || !isValidDocRef(liveDraftRef)) {
      return;
    }

    let cancelled = false;
    const finish = (result: PublishedVersionLoadResult<D>) => {
      if (!cancelled) {
        setLoaded({ attempt, liveDraftRef, result, version });
      }
    };

    const load = version === LATEST_PUBLISHED_VERSION
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
  }, [app.state, attempt, liveDraftRef, version]);

  // Ignore a result loaded for another request.
  if (
    loaded == null
    || loaded.attempt !== attempt
    || loaded.liveDraftRef !== liveDraftRef
    || loaded.version !== version
  ) {
    return LOADING;
  }
  return loaded.result;
}
