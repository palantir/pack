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

import type { CSSProperties, ReactElement } from "react";

// Inline because the build ships no CSS. Custom properties still resolve here, so consumers can
// theme by setting `--pack-error-toast-*` on an ancestor.
const STYLES = {
  code: {
    fontFamily: "var(--pack-error-toast-code-font-family, monospace)",
    fontSize: "var(--pack-error-toast-code-font-size, 11px)",
    opacity: "var(--pack-error-toast-code-opacity, 0.7)",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--pack-error-toast-gap, 2px)",
  },
  title: {
    fontWeight: "var(--pack-error-toast-title-font-weight, 600)",
  },
} satisfies Record<string, CSSProperties>;

export interface BaseErrorToastProps {
  /** Short machine-readable code shown in the footer, e.g. `"internalError"`. */
  readonly code?: string;
  /** Conjure `errorInstanceId` — identifies this one error occurrence in backend logs. */
  readonly correlationId?: string;
  /**
   * Labels the correlation id so it is not a bare unexplained string to the user.
   *
   * @default "Error instance ID"
   */
  readonly correlationIdLabel?: string;
  /** Human-readable explanation of what went wrong. */
  readonly detail: string;
  /** Headline, e.g. `"data channel error"`. */
  readonly title: string;
}

/**
 * Presentational toast body. Primitives only, no PACK dependencies, so any error source can use it.
 * See {@link ChannelErrorToast} for the channel-aware version.
 */
export function BaseErrorToast(
  { code, correlationId, correlationIdLabel = "Error instance ID", detail, title }:
    BaseErrorToastProps,
): ReactElement {
  const hasFooter = code != null || correlationId != null;

  return (
    <div style={STYLES.container}>
      <span style={STYLES.title}>{title}</span>
      <span>{detail}</span>
      {hasFooter && (
        <span style={STYLES.code}>
          {code}
          {code != null && correlationId != null && " · "}
          {correlationId != null && `${correlationIdLabel}: ${correlationId}`}
        </span>
      )}
    </div>
  );
}
