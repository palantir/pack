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

import type { ChannelError } from "@palantir/pack.document-schema.model-types";
import { ChannelErrorCode } from "@palantir/pack.document-schema.model-types";
import type { JSX } from "react";
import { BaseErrorToast } from "../errorToast/BaseErrorToast.js";

/** Default copy per error code. Exported so apps can read or spread it when building an override. */
export const CHANNEL_ERROR_MESSAGES: Readonly<Record<ChannelErrorCode, string>> = {
  [ChannelErrorCode.CLIENT_VERSION_TOO_LOW]:
    "This document requires a newer version of the app. Please refresh.",
  [ChannelErrorCode.OPERATIONAL_VERSION_BUMPED]:
    "This document was upgraded. Please reload to continue.",
  [ChannelErrorCode.REVISION_TOO_OLD]: "Your session is out of date. Please reload.",
  [ChannelErrorCode.INTERNAL_ERROR]: "A server error occurred.",
  [ChannelErrorCode.UNKNOWN]: "The connection encountered an error.",
};

/** Done here rather than with CSS `text-transform`, which would also re-case caller titles. */
function toSentenceCase(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export interface ChannelErrorToastProps {
  /** Which channel failed (e.g. "data", "presence"). */
  readonly channel: string;
  readonly error: ChannelError;
  /**
   * Per-code copy overrides; unlisted codes fall back to the defaults. Takes precedence over the
   * error's own `message`, which is what makes `unknown` errors localizable.
   *
   * @default CHANNEL_ERROR_MESSAGES
   */
  readonly messages?: Partial<Record<ChannelErrorCode, string>>;
  /**
   * Overrides the headline.
   *
   * @default `${Channel} channel error`
   */
  readonly title?: string;
}

/**
 * Renders a {@link ChannelError} via {@link BaseErrorToast}. Content only — pair it with your own
 * toaster, or use `useChannelErrorToasts` to wire up every channel.
 *
 * All copy is overridable via `messages` and `title`; this package ships no i18n.
 */
export function ChannelErrorToast(
  { channel, error, messages, title }: ChannelErrorToastProps,
): JSX.Element {
  return (
    <BaseErrorToast
      code={error.code}
      correlationId={error.errorInstanceId === "" ? undefined : error.errorInstanceId}
      detail={messages?.[error.code] ?? error.message ?? CHANNEL_ERROR_MESSAGES[error.code]}
      title={title ?? `${toSentenceCase(channel)} channel error`}
    />
  );
}
