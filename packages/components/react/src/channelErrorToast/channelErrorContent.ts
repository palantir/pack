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
import type { ChannelName } from "./channels.js";

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

/** The display strings for one channel error. */
export interface ChannelErrorContent {
  /** Short machine-readable code, or undefined when it would tell the user nothing. */
  readonly code: string | undefined;
  /** Identifies this occurrence in backend logs, or undefined when the error carries none. */
  readonly correlationId: string | undefined;
  /** Human-readable explanation of what went wrong. */
  readonly description: string;
  /** Headline. */
  readonly title: string;
}

export interface ChannelErrorContentOptions {
  /** Overrides the headline. */
  readonly formatTitle?: (channel: string) => string;
  /** Per-code copy overrides; unlisted codes fall back to {@link CHANNEL_ERROR_MESSAGES}. */
  readonly messages?: Partial<Record<ChannelErrorCode, string>>;
}

/**
 * Turns a typed {@link ChannelError} into the strings a toast shows. Pure and React-free, so the copy
 * rules can be tested without rendering.
 *
 * @param channel Which channel failed.
 * @param error The error that channel reported.
 * @param options Caller copy overrides.
 * @returns The display strings, with `code` and `correlationId` omitted when they carry no signal.
 */
export function channelErrorContent(
  channel: ChannelName,
  error: ChannelError,
  { formatTitle, messages }: ChannelErrorContentOptions = {},
): ChannelErrorContent {
  return {
    // `unknown` categorizes nothing, so it is noise in front of a user. The correlation id still
    // makes the failure findable, and the real cause is logged.
    code: error.code === ChannelErrorCode.UNKNOWN ? undefined : error.code,
    correlationId: error.errorInstanceId === "" ? undefined : error.errorInstanceId,
    // A caller override wins over the error's own message, which is what makes `unknown` localizable.
    description: messages?.[error.code] ?? error.message ?? CHANNEL_ERROR_MESSAGES[error.code],
    title: formatTitle?.(channel) ?? `${toSentenceCase(channel)} channel error`,
  };
}
