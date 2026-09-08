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
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import type { DocumentStatus, WithStateModule } from "@palantir/pack.state.core";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useEffect, useState } from "react";

/**
 * Subscribes to a document's load/connection status for each channel
 * (data, metadata, presence, activity).
 *
 * @experimental
 *
 * Each channel reports its own {@link DocumentSyncStatus}; when a channel's
 * subscription fails, `status.<channel>.load` is `ERROR` and
 * `status.<channel>.error` holds a typed {@link ChannelError} the UI can branch
 * on (e.g. `code === "clientVersionTooLow"`).
 *
 * @param app The PackApp instance.
 * @param docRef The document to observe, or undefined.
 * @returns The latest DocumentStatus, or undefined before the first update.
 *
 * @example
 * ```tsx
 * const status = useDocumentStatus(app, docRef);
 * if (status?.data.error?.code === ChannelErrorCode.CLIENT_VERSION_TOO_LOW) {
 *   return <UpgradeBanner />;
 * }
 * ```
 */
export function useDocumentStatus(
  app: WithStateModule<PackApp>,
  docRef: DocumentRef | undefined,
): DocumentStatus | undefined {
  const [status, setStatus] = useState<DocumentStatus>();

  useEffect(() => {
    if (docRef == null || !isValidDocRef(docRef)) {
      setStatus(undefined);
      return;
    }

    // onStatusChange fires immediately with the current status, then on change.
    const unsubscribe = app.state.onStatusChange(docRef, (_docRef, next) => {
      setStatus(next);
    });

    return () => {
      unsubscribe();
    };
  }, [app.state, docRef]);

  return status;
}
