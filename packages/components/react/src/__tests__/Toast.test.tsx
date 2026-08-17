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

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { ToastDetail } from "../base-components/toast/Toast.js";
import { ToastRegion, ToastStack, useToastManager } from "../base-components/toast/Toast.js";

interface QueueProps {
  readonly data?: ToastDetail;
  readonly description?: string;
  readonly title?: string;
}

/** Fires from a click rather than an effect: queueing during commit trips React's scheduler. */
function Queue({ data, description = "went wrong", title = "Boom" }: QueueProps): ReactElement {
  const { add } = useToastManager();
  return (
    <button onClick={() => add({ data, description, timeout: 0, title })} type="button">
      queue
    </button>
  );
}

/** Base UI picks `alertdialog` for `priority: "high"` toasts and `dialog` otherwise. */
const TOAST_SELECTOR = "[role=\"dialog\"], [role=\"alertdialog\"]";

function toastElement(): Element | null {
  return document.querySelector(TOAST_SELECTOR);
}

function harness(props: QueueProps = {}): ReactElement {
  return (
    <ToastRegion>
      <Queue {...props} />
      <ToastStack />
    </ToastRegion>
  );
}

describe("Toast", () => {
  it("renders the title and description it was queued with", () => {
    render(harness());

    fireEvent.click(screen.getByText("queue"));

    const toast = toastElement();
    expect(toast?.querySelector("h2")?.textContent).toBe("Boom");
    expect(toast?.querySelector("p")?.textContent).toBe("went wrong");
  });

  it("renders code and correlation id from the toast's data", () => {
    render(harness({ data: { code: "internalError", correlationId: "abc-123" } }));

    fireEvent.click(screen.getByText("queue"));

    // Default label, since none was supplied.
    expect(toastElement()?.textContent).toContain("internalError · Error instance ID: abc-123");
  });

  it("uses a supplied correlation id label", () => {
    render(harness({ data: { correlationId: "abc-123", correlationIdLabel: "Trace" } }));

    fireEvent.click(screen.getByText("queue"));

    expect(toastElement()?.textContent).toContain("Trace: abc-123");
  });

  it("omits the detail line when there is no code or correlation id", () => {
    render(harness({ data: {} }));

    fireEvent.click(screen.getByText("queue"));

    const toast = toastElement();
    expect(toast?.textContent).toContain("went wrong");
    // The detail line would contribute the separator or the correlation id label.
    expect(toast?.textContent).not.toContain("·");
    expect(toast?.textContent).not.toContain("Error instance ID");
  });

  it("dismisses a toast from its close button", () => {
    render(harness());
    fireEvent.click(screen.getByText("queue"));

    fireEvent.click(screen.getByLabelText("Dismiss"));

    expect(toastElement()).toBeNull();
  });

  it("highlights the close button on hover and on focus", () => {
    render(harness());
    fireEvent.click(screen.getByText("queue"));
    const close = screen.getByLabelText("Dismiss");

    // `:hover` and `:focus-visible` are not expressible inline, so the highlight is state-driven.
    expect(close.getAttribute("style")).toContain("opacity: 0.7");

    fireEvent.mouseEnter(close);
    expect(close.getAttribute("style")).toContain("opacity: 1");

    fireEvent.mouseLeave(close);
    expect(close.getAttribute("style")).toContain("opacity: 0.7");

    fireEvent.focus(close);
    expect(close.getAttribute("style")).toContain("opacity: 1");

    fireEvent.blur(close);
    expect(close.getAttribute("style")).toContain("opacity: 0.7");
  });

  it("labels the region and close button, and overrides both", () => {
    render(
      <ToastRegion>
        <Queue />
        <ToastStack closeLabel="Close this" regionLabel="Document problems" />
      </ToastRegion>,
    );
    fireEvent.click(screen.getByText("queue"));

    expect(screen.getByLabelText("Document problems")).toBeTruthy();
    expect(screen.getByLabelText("Close this")).toBeTruthy();
  });

  it("keeps toasts past the limit mounted but inert rather than dropping them", () => {
    render(
      <ToastRegion limit={1}>
        <Queue />
        <ToastStack />
      </ToastRegion>,
    );

    fireEvent.click(screen.getByText("queue"));
    fireEvent.click(screen.getByText("queue"));

    const toasts = document.querySelectorAll(TOAST_SELECTOR);
    expect(toasts).toHaveLength(2);
    expect([...toasts].filter(node => node.hasAttribute("data-limited"))).toHaveLength(1);
  });
});
