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
import type { ChannelErrorCode, DocumentRef } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { useDocumentStatus } from "@palantir/pack.state.react";
import { useEffect, useRef } from "react";
import { useToastManager } from "../base-components/toast/Toast.js";
import { channelErrorContent } from "./channelErrorContent.js";
import type { ChannelName } from "./channels.js";
import { channelErrorStates, errorId } from "./channels.js";

/** One surfaced channel error, as reported to listeners. */
export interface SurfacedChannelError {
  /** Which channel failed. */
  readonly channel: ChannelName;
  /** The error's code. */
  readonly code: ChannelErrorCode;
  /** The toast's id, stable for this occurrence. */
  readonly id: string;
}

export interface UseChannelErrorToastsArgs {
  readonly app: WithStateModule<PackApp>;
  readonly correlationIdLabel?: string;
  readonly docRef: DocumentRef;
  readonly formatTitle?: (channel: string) => string;
  readonly messages?: Partial<Record<ChannelErrorCode, string>>;
  readonly onErrorShown?: (error: SurfacedChannelError) => void;
}

/**
 * Queues a persistent toast for each new error reported by one of a document's channels. Internal:
 * it must run inside a `ToastRegion`, so it is reached through `ChannelErrorToasts` rather than
 * exported.
 */
export function useChannelErrorToasts(
  { app, correlationIdLabel, docRef, formatTitle, messages, onErrorShown }:
    UseChannelErrorToastsArgs,
): void {
  const status = useDocumentStatus(app, docRef);
  const { add, close } = useToastManager();

  // The last error surfaced per channel. Kept after the user dismisses a toast so the next
  // notification does not resurrect it; deleted on recovery so a relapse counts as new.
  const surfacedByChannel = useRef<Map<ChannelName, string>>(new Map());
  // Refs so unmemoized overrides and listeners cannot churn the effect.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const formatTitleRef = useRef(formatTitle);
  formatTitleRef.current = formatTitle;
  const correlationIdLabelRef = useRef(correlationIdLabel);
  correlationIdLabelRef.current = correlationIdLabel;
  const onErrorShownRef = useRef(onErrorShown);
  onErrorShownRef.current = onErrorShown;
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    return () => {
      closeRef.current();
      surfacedByChannel.current.clear();
    };
  }, [app, docRef]);

  useEffect(() => {
    if (status == null) {
      return;
    }

    for (const { channel, error } of channelErrorStates(status)) {
      if (error == null) {
        surfacedByChannel.current.delete(channel);
        continue;
      }

      const id = errorId(channel, error);
      if (surfacedByChannel.current.get(channel) === id) {
        continue;
      }
      surfacedByChannel.current.set(channel, id);

      const { code, correlationId, description, title } = channelErrorContent(channel, error, {
        formatTitle: formatTitleRef.current,
        messages: messagesRef.current,
      });

      add({
        data: { code, correlationId, correlationIdLabel: correlationIdLabelRef.current },
        description,
        id,
        // Errors are the user's problem to act on, so they wait for a dismissal and are announced
        // urgently rather than politely.
        priority: "high",
        timeout: 0,
        title,
      });
      onErrorShownRef.current?.({ channel, code: error.code, id });
    }
    // Deliberately not keyed on `app`/`docRef`. `useDocumentStatus` writes its state from an effect,
    // so those change one render before the new document's status arrives — running here would
    // surface the previous document's errors right after the cleanup above closed them.
  }, [add, status]);
}
