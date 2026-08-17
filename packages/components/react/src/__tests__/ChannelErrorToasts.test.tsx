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
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import { ChannelErrorCode } from "@palantir/pack.document-schema.model-types";
import type {
  DocumentStatus,
  DocumentSyncStatus,
  WithStateModule,
} from "@palantir/pack.state.core";
import { DocumentLiveStatus, DocumentLoadStatus } from "@palantir/pack.state.core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelErrorToasts } from "../channelErrorToast/ChannelErrorToasts.js";

const mockUseDocumentStatus = vi.hoisted(() => vi.fn());

vi.mock("@palantir/pack.state.react", () => ({
  useDocumentStatus: mockUseDocumentStatus,
}));

const OK: DocumentSyncStatus = {
  live: DocumentLiveStatus.CONNECTED,
  load: DocumentLoadStatus.LOADED,
};

const ERRORED: DocumentSyncStatus = {
  error: { code: ChannelErrorCode.INTERNAL_ERROR, errorInstanceId: "abc-123" },
  live: DocumentLiveStatus.ERROR,
  load: DocumentLoadStatus.ERROR,
};

function statusWith(overrides: Partial<DocumentStatus>): DocumentStatus {
  return { activity: OK, data: OK, metadata: OK, presence: OK, ...overrides };
}

const APP = {} as WithStateModule<PackApp>;
const DOC_REF = { id: "doc-a" } as DocumentRef;
const OTHER_DOC_REF = { id: "doc-b" } as DocumentRef;

/**
 * Base UI renders each toast twice: the visible one, plus a copy inside an off-screen `role="alert"`
 * region that does the screen-reader announcing. Counting the visible ones keeps assertions honest
 * about what the user sees.
 */
function visibleToastCount(): number {
  return document.querySelectorAll("[role=\"alertdialog\"]").length;
}

function titles(): string[] {
  return [...document.querySelectorAll("[role=\"alertdialog\"] h2")].map(node =>
    node.textContent ?? ""
  );
}

/**
 * Mirrors `useDocumentStatus`'s one-render lag: it holds status in state written from an effect, so on
 * the render where `docRef` changes it still reports the previous document's status. A mock that
 * resolved the new document synchronously could not exercise that path at all.
 */
function laggingStatus(
  statusByDocRef: ReadonlyMap<DocumentRef, DocumentStatus>,
): (app: unknown, docRef: DocumentRef) => DocumentStatus | undefined {
  return function useLaggingStatus(_app, docRef) {
    const [current, setCurrent] = useState<DocumentStatus>();
    useEffect(() => {
      setCurrent(statusByDocRef.get(docRef));
    }, [docRef]);
    return current;
  };
}

function harness(docRef: DocumentRef = DOC_REF): ReactElement {
  return <ChannelErrorToasts app={APP} docRef={docRef} />;
}

describe("ChannelErrorToasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a toast for a channel reporting an error, with no toaster supplied", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    render(harness());

    expect(visibleToastCount()).toBe(1);
    expect(titles()).toEqual(["Data channel error"]);
    expect(screen.getAllByText("A server error occurred.").length).toBeGreaterThan(0);
  });

  it("shows the error code and correlation id", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    render(harness());

    const toast = document.querySelector("[role=\"alertdialog\"]");
    expect(toast?.textContent).toContain(ChannelErrorCode.INTERNAL_ERROR);
    expect(toast?.textContent).toContain("Error instance ID: abc-123");
  });

  it("shows nothing when every channel is healthy", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({}));

    render(harness());

    expect(visibleToastCount()).toBe(0);
  });

  it("shows one toast per failing channel", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED, presence: ERRORED }));

    render(harness());

    expect(titles().sort()).toEqual(["Data channel error", "Presence channel error"]);
  });

  it("shows one toast while a channel keeps reporting the same error", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());

    for (let i = 0; i < 5; i++) {
      // A new status object every notification, same underlying error.
      mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
      rerender(harness());
    }

    expect(visibleToastCount()).toBe(1);
  });

  it("shows another toast when a different error arrives on the same channel", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());

    mockUseDocumentStatus.mockReturnValue(
      statusWith({
        data: {
          ...ERRORED,
          error: { code: ChannelErrorCode.REVISION_TOO_OLD, errorInstanceId: "def-456" },
        },
      }),
    );
    rerender(harness());

    expect(visibleToastCount()).toBe(2);
  });

  it("leaves the toast up after the channel recovers", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());

    mockUseDocumentStatus.mockReturnValue(statusWith({}));
    rerender(harness());

    // Dismissal is the user's to make; recovery does not retract what already happened.
    expect(visibleToastCount()).toBe(1);
  });

  it("reuses the standing toast when an error still on screen relapses", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());

    mockUseDocumentStatus.mockReturnValue(statusWith({}));
    rerender(harness());
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
    rerender(harness());

    // The toast for this error is still on screen, and re-adding an existing id updates in place.
    // Stacking a second identical toast would just be noise.
    expect(visibleToastCount()).toBe(1);
  });

  it("shows a new toast when a dismissed error relapses after recovery", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(visibleToastCount()).toBe(0);

    mockUseDocumentStatus.mockReturnValue(statusWith({}));
    rerender(harness());
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
    rerender(harness());

    // Recovery forgets the channel's last error, so a relapse is news again even though the user
    // had dismissed the identical error earlier.
    expect(visibleToastCount()).toBe(1);
  });

  it("dismisses a toast when its close button is clicked", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    render(harness());
    expect(visibleToastCount()).toBe(1);

    fireEvent.click(screen.getByLabelText("Dismiss"));

    expect(visibleToastCount()).toBe(0);
  });

  it("does not resurrect a dismissed toast on the next status notification", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const { rerender } = render(harness());
    fireEvent.click(screen.getByLabelText("Dismiss"));

    mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
    rerender(harness());

    expect(visibleToastCount()).toBe(0);
  });

  it("does not re-show the previous document's error when the document changes", () => {
    mockUseDocumentStatus.mockImplementation(laggingStatus(
      new Map([
        [DOC_REF, statusWith({ data: ERRORED })],
        [OTHER_DOC_REF, statusWith({})],
      ]),
    ));

    const { rerender } = render(harness(DOC_REF));
    expect(visibleToastCount()).toBe(1);

    rerender(harness(OTHER_DOC_REF));

    // Nothing dismisses on recovery, so a stale re-show would sit on screen over a healthy document.
    expect(visibleToastCount()).toBe(0);
  });

  it("shows the new document's error when the document changes", () => {
    mockUseDocumentStatus.mockImplementation(laggingStatus(
      new Map([
        [DOC_REF, statusWith({ data: ERRORED })],
        [
          OTHER_DOC_REF,
          statusWith({
            data: {
              ...ERRORED,
              error: { code: ChannelErrorCode.REVISION_TOO_OLD, errorInstanceId: "xyz-789" },
            },
          }),
        ],
      ]),
    ));

    const { rerender } = render(harness(DOC_REF));
    rerender(harness(OTHER_DOC_REF));

    expect(titles()).toEqual(["Data channel error"]);
    const toast = document.querySelector("[role=\"alertdialog\"]");
    expect(toast?.textContent).toContain("xyz-789");
  });

  it("forwards copy overrides", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    render(
      <ChannelErrorToasts
        app={APP}
        correlationIdLabel="Trace"
        docRef={DOC_REF}
        formatTitle={channel => `Sync issue: ${channel}`}
        messages={{ [ChannelErrorCode.INTERNAL_ERROR]: "Custom server error copy." }}
      />,
    );

    const toast = document.querySelector("[role=\"alertdialog\"]");
    expect(toast?.textContent).toContain("Sync issue: data");
    expect(toast?.textContent).toContain("Custom server error copy.");
    expect(toast?.textContent).toContain("Trace: abc-123");
  });

  it("reports each surfaced error to onErrorShown without replacing the toast", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const onErrorShown = vi.fn();

    render(<ChannelErrorToasts app={APP} docRef={DOC_REF} onErrorShown={onErrorShown} />);

    expect(onErrorShown).toHaveBeenCalledTimes(1);
    expect(onErrorShown).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "data", code: ChannelErrorCode.INTERNAL_ERROR }),
    );
    expect(visibleToastCount()).toBe(1);
  });

  it("labels the toast region and close button for assistive technology", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    render(
      <ChannelErrorToasts
        app={APP}
        closeLabel="Close this"
        docRef={DOC_REF}
        regionLabel="Document problems"
      />,
    );

    expect(screen.getByLabelText("Document problems")).toBeTruthy();
    expect(screen.getByLabelText("Close this")).toBeTruthy();
  });
});
