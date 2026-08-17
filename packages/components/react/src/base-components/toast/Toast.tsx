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

import { Toast as BaseUIToast } from "@base-ui/react/toast";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useState } from "react";

/**
 * Four channels can fail at once, and a channel that recovers then fails again adds more. Base UI
 * marks anything past the limit `data-limited` + `inert` rather than dropping it, so this only needs
 * to be generous.
 */
const DEFAULT_LIMIT = 5;

// Inline because the build ships no CSS. Every value is a custom property so consumers can theme by
// setting `--pack-toast-*` on an ancestor. Swapping to CSS modules later means replacing each
// `style={STYLES.x}` with `className={styles.x}` and moving these values across unchanged.
const STYLES = {
  close: {
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "var(--pack-toast-close-radius, 2px)",
    color: "inherit",
    cursor: "pointer",
    flex: "none",
    font: "inherit",
    lineHeight: 1,
    paddingBlock: "var(--pack-toast-close-padding-block, 0)",
    paddingInline: "var(--pack-toast-close-padding-inline, 2px)",
  },
  detail: {
    fontFamily: "var(--pack-toast-detail-font-family, monospace)",
    fontSize: "var(--pack-toast-detail-font-size, 11px)",
    opacity: "var(--pack-toast-detail-opacity, 0.7)",
  },
  body: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: "var(--pack-toast-body-gap, 2px)",
    minWidth: 0,
  },
  description: {
    margin: 0,
  },
  root: {
    alignItems: "flex-start",
    backgroundColor: "var(--pack-toast-bg, #cd4246)",
    borderRadius: "var(--pack-toast-radius, 2px)",
    boxShadow: "var(--pack-toast-shadow, 0 2px 4px rgba(17, 20, 24, 0.2))",
    color: "var(--pack-toast-fg, #ffffff)",
    display: "flex",
    gap: "var(--pack-toast-gap, 8px)",
    paddingBlock: "var(--pack-toast-padding-block, 8px)",
    paddingInline: "var(--pack-toast-padding-inline, 12px)",
    // The viewport spans the width of the stack, so only the toasts themselves take pointer events.
    pointerEvents: "auto",
  },
  title: {
    fontSize: "inherit",
    fontWeight: "var(--pack-toast-title-font-weight, 600)",
    margin: 0,
  },
  viewport: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--pack-toast-stack-gap, 8px)",
    left: "50%",
    maxWidth: "var(--pack-toast-max-width, 420px)",
    pointerEvents: "none",
    position: "fixed",
    top: "var(--pack-toast-inset-top, 16px)",
    transform: "translateX(-50%)",
    width: "max-content",
    zIndex: "var(--pack-toast-z-index, 40)",
  },
} satisfies Record<string, CSSProperties>;

/** Extra strings shown under a toast's description. */
export interface ToastDetail {
  /** Short machine-readable code. */
  readonly code?: string | undefined;
  /** Identifies the occurrence in backend logs. */
  readonly correlationId?: string | undefined;
  /** Labels the correlation id so it is not a bare unexplained string. */
  readonly correlationIdLabel?: string | undefined;
}

interface CloseButtonProps {
  readonly label: string;
}

/** Separate component so the highlight can hold state; `:hover` is not expressible inline. */
function CloseButton({ label }: CloseButtonProps): ReactElement {
  const [isHighlighted, setIsHighlighted] = useState(false);

  return (
    <BaseUIToast.Close
      aria-label={label}
      onBlur={() => setIsHighlighted(false)}
      onFocus={() => setIsHighlighted(true)}
      onMouseEnter={() => setIsHighlighted(true)}
      onMouseLeave={() => setIsHighlighted(false)}
      style={{ ...STYLES.close, opacity: isHighlighted ? 1 : 0.7 }}
    >
      ✕
    </BaseUIToast.Close>
  );
}

export interface ToastStackProps {
  /**
   * Accessible name for the region holding the toasts.
   *
   * @default "Notifications"
   */
  readonly regionLabel?: string;
  /**
   * Accessible name for each toast's close button.
   *
   * @default "Dismiss"
   */
  readonly closeLabel?: string;
}

/**
 * Renders every toast currently held by the manager. Must be inside {@link ToastRegion}.
 *
 * Reads `code` / `correlationId` / `correlationIdLabel` off each toast's `data`, so callers pass copy
 * through `add({ data })` rather than embedding markup — Base UI only announces the `title` and
 * `description` strings.
 */
export function ToastStack(
  { closeLabel = "Dismiss", regionLabel = "Notifications" }: ToastStackProps,
): ReactElement {
  const { toasts } = BaseUIToast.useToastManager<ToastDetail>();

  return (
    <BaseUIToast.Portal>
      <BaseUIToast.Viewport aria-label={regionLabel} style={STYLES.viewport}>
        {toasts.map(toast => {
          const { code, correlationId, correlationIdLabel = "Error instance ID" } = toast.data
            ?? {};
          const hasDetail = code != null || correlationId != null;

          return (
            <BaseUIToast.Root key={toast.id} style={STYLES.root} toast={toast}>
              <div style={STYLES.body}>
                <BaseUIToast.Title style={STYLES.title} />
                <BaseUIToast.Description style={STYLES.description} />
                {hasDetail && (
                  <span style={STYLES.detail}>
                    {code}
                    {code != null && correlationId != null && " · "}
                    {correlationId != null && `${correlationIdLabel}: ${correlationId}`}
                  </span>
                )}
              </div>
              <CloseButton label={closeLabel} />
            </BaseUIToast.Root>
          );
        })}
      </BaseUIToast.Viewport>
    </BaseUIToast.Portal>
  );
}

export interface ToastRegionProps {
  /** Subtree that queues toasts. Anything calling {@link useToastManager} must be inside it. */
  readonly children?: ReactNode;
  /**
   * How many toasts show at once. Excess ones stay mounted but `inert`.
   *
   * @default 5
   */
  readonly limit?: number;
}

/**
 * Provides toast state to its subtree. Pair with {@link ToastStack}, which does the rendering.
 *
 * @example
 * ```tsx
 * <ToastRegion>
 *   <Queues />
 *   <ToastStack />
 * </ToastRegion>
 * ```
 */
export function ToastRegion({ children, limit = DEFAULT_LIMIT }: ToastRegionProps): ReactElement {
  return <BaseUIToast.Provider limit={limit}>{children}</BaseUIToast.Provider>;
}

/** Queues, updates, and closes toasts. Must be called inside a {@link ToastRegion}. */
export function useToastManager(): ReturnType<typeof BaseUIToast.useToastManager<ToastDetail>> {
  return BaseUIToast.useToastManager<ToastDetail>();
}
