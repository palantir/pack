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
import styles from "./StatusErrorToast.module.css";

// Human-readable guidance per error code.
const CODE_MESSAGES: Record<ChannelErrorCode, string> = {
  [ChannelErrorCode.CLIENT_VERSION_TOO_LOW]:
    "This document requires a newer version of the app. Please refresh.",
  [ChannelErrorCode.OPERATIONAL_VERSION_BUMPED]:
    "This document was upgraded. Please reload to continue.",
  [ChannelErrorCode.REVISION_TOO_OLD]: "Your session is out of date. Please reload.",
  [ChannelErrorCode.INTERNAL_ERROR]: "A server error occurred.",
  [ChannelErrorCode.UNKNOWN]: "The connection encountered an error.",
};

interface StatusErrorToastProps {
  /** Which channel failed (e.g. "data", "presence"). */
  readonly channel: string;
  readonly error: ChannelError;
}

export const StatusErrorToast = ({ channel, error }: StatusErrorToastProps) => {
  return (
    <div className={styles.container}>
      <span className={styles.title}>
        {channel} channel error
      </span>
      <span>{error.message ?? CODE_MESSAGES[error.code]}</span>
      <span className={styles.code}>
        {error.code}
        {error.errorInstanceId !== "" && ` · ${error.errorInstanceId}`}
      </span>
    </div>
  );
};
