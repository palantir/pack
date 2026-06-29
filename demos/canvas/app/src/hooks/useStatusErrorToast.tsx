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

import type { Toaster } from "@blueprintjs/core";
import type { PackApp } from "@palantir/pack.core";
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { DocumentLoadStatus } from "@palantir/pack.state.core";
import { useDocumentStatus } from "@palantir/pack.state.react";
import { useEffect, useRef } from "react";
import { StatusErrorToast } from "../components/toast/StatusErrorToast.js";

const CHANNELS = ["data", "metadata", "presence", "activity"] as const;

/**
 * Example use of {@link useDocumentStatus}: shows a toast whenever any of the
 * document's channels (data, metadata, presence, activity) reports an error,
 * rendering the typed ChannelError. Pass a top-center positioned toaster.
 */
export function useStatusErrorToast(
  app: WithStateModule<PackApp>,
  docRef: DocumentRef,
  toaster: Toaster | null,
): void {
  const status = useDocumentStatus(app, docRef);
  // Per-channel toast key, so a channel updates its existing toast rather than stacking.
  const toastKeys = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (toaster == null || status == null) {
      return;
    }

    for (const channel of CHANNELS) {
      const channelStatus = status[channel];
      const existingKey = toastKeys.current.get(channel);

      if (channelStatus.load === DocumentLoadStatus.ERROR && channelStatus.error != null) {
        const key = toaster.show(
          {
            icon: "error",
            intent: "danger",
            message: <StatusErrorToast channel={channel} error={channelStatus.error} />,
            timeout: 0,
          },
          existingKey,
        );
        if (key != null) {
          toastKeys.current.set(channel, key);
        }
      } else if (existingKey != null) {
        toaster.dismiss(existingKey);
        toastKeys.current.delete(channel);
      }
    }
  }, [toaster, status]);
}
