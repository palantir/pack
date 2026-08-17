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
import type { ReactElement } from "react";
import { ToastRegion, ToastStack } from "../base-components/toast/Toast.js";
import type { SurfacedChannelError, UseChannelErrorToastsArgs } from "./useChannelErrorToasts.js";
import { useChannelErrorToasts } from "./useChannelErrorToasts.js";

export interface ChannelErrorToastsProps {
  /** The PackApp instance. */
  readonly app: WithStateModule<PackApp>;
  /**
   * Accessible name for each toast's dismiss button.
   *
   * @default "Dismiss"
   */
  readonly closeLabel?: string;
  /**
   * Labels the error instance id shown under each toast's message.
   *
   * @default "Error instance ID"
   */
  readonly correlationIdLabel?: string;
  /** The document to observe. */
  readonly docRef: DocumentRef;
  /**
   * Builds each channel's headline.
   *
   * @default `${Channel} channel error`
   */
  readonly formatTitle?: (channel: string) => string;
  /**
   * How many toasts show at once. Excess ones stay mounted but inert.
   *
   * @default 5
   */
  readonly limit?: number;
  /**
   * Per-code copy overrides; unlisted codes fall back to the defaults.
   *
   * @default CHANNEL_ERROR_MESSAGES
   */
  readonly messages?: Partial<Record<ChannelErrorCode, string>>;
  /**
   * Called once per error as its toast appears, for logging or metrics. Does not replace the toast.
   *
   * @param error The error that was surfaced.
   */
  readonly onErrorShown?: (error: SurfacedChannelError) => void;
  /**
   * Accessible name for the region holding the toasts.
   *
   * @default "Notifications"
   */
  readonly regionLabel?: string;
}

/**
 * Shows a dismissible toast for each error reported by one of a document's channels, rendering its own
 * overlay. Mount it once inside a document's UI and pass nothing else — there is no toaster to supply
 * and no stylesheet to import.
 *
 * A repeated identical error gets one toast. A toast stays up after its channel recovers, until the
 * user dismisses it. A channel that recovers and fails again gets a new toast. Changing document
 * clears the stack.
 *
 * @example
 * ```tsx
 * <ChannelErrorToasts app={app} docRef={docRef} />
 * ```
 */
export function ChannelErrorToasts(
  { closeLabel, limit, regionLabel, ...toastArgs }: ChannelErrorToastsProps,
): ReactElement {
  return (
    <ToastRegion limit={limit}>
      <ChannelErrorToastQueue {...toastArgs} />
      <ToastStack closeLabel={closeLabel} regionLabel={regionLabel} />
    </ToastRegion>
  );
}

/** Separate component because the hook has to run inside the region the parent creates. */
function ChannelErrorToastQueue(args: UseChannelErrorToastsArgs): null {
  useChannelErrorToasts(args);
  return null;
}
