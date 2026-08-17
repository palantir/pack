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
import type { DocumentStatus } from "@palantir/pack.state.core";
import { DocumentLoadStatus } from "@palantir/pack.state.core";

export type ChannelName = "data" | "metadata" | "presence" | "activity";

/**
 * Document channels this package surfaces errors for. The `satisfies` clause keeps the list honest
 * against {@link DocumentStatus}; the explicit annotation is required by `--isolatedDeclarations`.
 */
export const CHANNELS: ReadonlyArray<ChannelName> = [
  "data",
  "metadata",
  "presence",
  "activity",
] satisfies ReadonlyArray<keyof DocumentStatus>;

/** One channel's error state, or undefined when that channel is healthy. */
export interface ChannelErrorState {
  readonly channel: ChannelName;
  readonly error: ChannelError | undefined;
}

/**
 * Identifies one error occurrence on one channel. `status` is a new object on every notification, so
 * comparing these distinguishes "the same error again" from "a different error", and doubles as the
 * toast id — re-adding an existing id updates in place instead of stacking a duplicate.
 */
export function errorId(channel: ChannelName, error: ChannelError): string {
  return [channel, error.code, error.errorInstanceId, error.message ?? ""].join("|");
}

/** Every channel's error state, in a stable order. */
export function channelErrorStates(status: DocumentStatus): ReadonlyArray<ChannelErrorState> {
  return CHANNELS.map(channel => {
    const channelStatus = status[channel];
    return {
      channel,
      error: channelStatus.load === DocumentLoadStatus.ERROR ? channelStatus.error : undefined,
    };
  });
}
