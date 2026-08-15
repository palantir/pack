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
import type {
  ChannelError,
  ChannelErrorCode,
  DocumentRef,
} from "@palantir/pack.document-schema.model-types";
import type { DocumentStatus, WithStateModule } from "@palantir/pack.state.core";
import { DocumentLoadStatus } from "@palantir/pack.state.core";
import { useDocumentStatus } from "@palantir/pack.state.react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ChannelErrorToast } from "./ChannelErrorToast.js";

/** Document channels surfaced by this hook. */
const CHANNELS = ["data", "metadata", "presence", "activity"] as const satisfies ReadonlyArray<
  keyof DocumentStatus
>;
type ChannelName = (typeof CHANNELS)[number];

/** `key` is undefined once the toast leaves the screen; `error` is kept so we can spot a new one. */
interface ChannelToastState {
  readonly error: ChannelError;
  key: string | undefined;
}

function dismissTrackedToasts(
  toaster: ChannelErrorToaster | null,
  toastStateByChannel: Map<ChannelName, ChannelToastState>,
): void {
  const states = [...toastStateByChannel.values()];
  toastStateByChannel.clear();

  if (toaster != null) {
    for (const state of states) {
      if (state.key != null) {
        toaster.dismiss(state.key);
      }
    }
  }
}

function isSameChannelError(a: ChannelError, b: ChannelError): boolean {
  return a.code === b.code
    && a.errorInstanceId === b.errorInstanceId
    && a.message === b.message;
}

/** Minimal toaster API used by {@link useChannelErrorToasts}. */
export interface ChannelErrorToaster {
  readonly dismiss: (key: string) => void;
  readonly show: (
    props: {
      readonly icon: "error";
      readonly intent: "danger";
      readonly message: ReactNode;
      readonly onDismiss: (didTimeoutExpire: boolean) => void;
      readonly timeout: 0;
    },
    key?: string,
  ) => string;
}

export interface UseChannelErrorToastsArgs {
  /** The PackApp instance. */
  readonly app: WithStateModule<PackApp>;
  /**
   * Labels the error instance id shown in each toast's footer.
   *
   * @default "Error instance ID"
   */
  readonly correlationIdLabel?: string;
  /** The document to observe. */
  readonly docRef: DocumentRef;
  /**
   * Builds each channel's headline. A function because this hook drives all four channels.
   *
   * @default `${Channel} channel error`
   */
  readonly formatTitle?: (channel: string) => string;
  /**
   * Per-code copy overrides. Read when a toast is shown, so changes do not relabel live toasts.
   *
   * @default CHANNEL_ERROR_MESSAGES
   */
  readonly messages?: Partial<Record<ChannelErrorCode, string>>;
  /**
   * Target toaster, or null while it is still being created. It must not enforce `maxToasts`,
   * because evictions are indistinguishable from user dismissals. Top-center reads best.
   */
  readonly toaster: ChannelErrorToaster | null;
}

/**
 * Shows a persistent toast whenever one of a document's four channels reports an error, dismissing
 * it on recovery. One toast per channel, and a dismissed toast stays dismissed until the error
 * itself changes.
 *
 * @example
 * ```tsx
 * useChannelErrorToasts({ app, docRef, toaster });
 * ```
 */
export function useChannelErrorToasts(
  { app, correlationIdLabel, docRef, formatTitle, messages, toaster }: UseChannelErrorToastsArgs,
): void {
  const status = useDocumentStatus(app, docRef);
  const toastStateByChannel = useRef<Map<ChannelName, ChannelToastState>>(new Map());
  // Refs so unmemoized overrides cannot churn the effect.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const formatTitleRef = useRef(formatTitle);
  formatTitleRef.current = formatTitle;
  const correlationIdLabelRef = useRef(correlationIdLabel);
  correlationIdLabelRef.current = correlationIdLabel;

  useEffect(() => {
    return () => {
      dismissTrackedToasts(toaster, toastStateByChannel.current);
    };
  }, [app, docRef, toaster]);

  useEffect(() => {
    if (toaster == null || status == null) {
      return;
    }

    for (const channel of CHANNELS) {
      const channelStatus = status[channel];
      const previous = toastStateByChannel.current.get(channel);
      const error = channelStatus.load === DocumentLoadStatus.ERROR
        ? channelStatus.error
        : undefined;

      if (error == null) {
        if (previous != null) {
          if (previous.key != null) {
            toaster.dismiss(previous.key);
          }
          toastStateByChannel.current.delete(channel);
        }
        continue;
      }

      // `status` is a new object every notification; without this, dismissed toasts resurrect.
      if (previous != null && isSameChannelError(previous.error, error)) {
        continue;
      }

      const next: ChannelToastState = { error, key: undefined };
      next.key = toaster.show(
        {
          icon: "error",
          intent: "danger",
          message: (
            <ChannelErrorToast
              channel={channel}
              correlationIdLabel={correlationIdLabelRef.current}
              error={error}
              messages={messagesRef.current}
              title={formatTitleRef.current?.(channel)}
            />
          ),
          onDismiss: () => {
            if (toastStateByChannel.current.get(channel) === next) {
              next.key = undefined;
            }
          },
          timeout: 0,
        },
        previous?.key,
      );
      toastStateByChannel.current.set(channel, next);
    }
  }, [app, docRef, toaster, status]);
}
