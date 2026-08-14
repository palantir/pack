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

import type { Toaster } from "@blueprintjs/core";
import type { PackApp } from "@palantir/pack.core";
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import { ChannelErrorCode } from "@palantir/pack.document-schema.model-types";
import type {
  DocumentStatus,
  DocumentSyncStatus,
  WithStateModule,
} from "@palantir/pack.state.core";
import { DocumentLiveStatus, DocumentLoadStatus } from "@palantir/pack.state.core";
import { render, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChannelErrorToasts } from "../channelErrorToast/useChannelErrorToasts.js";

const mockUseDocumentStatus = vi.hoisted(() => vi.fn());

vi.mock("@palantir/pack.state.react", () => ({
  useDocumentStatus: mockUseDocumentStatus,
}));

const OK: DocumentSyncStatus = {
  live: DocumentLiveStatus.CONNECTED,
  load: DocumentLoadStatus.LOADED,
};

function statusWith(overrides: Partial<DocumentStatus>): DocumentStatus {
  return { activity: OK, data: OK, metadata: OK, presence: OK, ...overrides };
}

const ERRORED: DocumentSyncStatus = {
  error: { code: ChannelErrorCode.INTERNAL_ERROR, errorInstanceId: "abc-123" },
  live: DocumentLiveStatus.ERROR,
  load: DocumentLoadStatus.ERROR,
};

const APP = {} as WithStateModule<PackApp>;
const DOC_REF = {} as DocumentRef;

function createMockToaster(): Toaster {
  let nextKey = 0;
  return {
    dismiss: vi.fn(),
    show: vi.fn(() => `toast-${nextKey++}`),
  } as unknown as Toaster;
}

describe("useChannelErrorToasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a toast for a channel reporting an error", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    renderHook(() => useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster }));

    expect(toaster.show).toHaveBeenCalledTimes(1);
    // Persistent until the error clears, and flagged as a danger.
    expect(vi.mocked(toaster.show).mock.calls[0]?.[0]).toMatchObject({
      intent: "danger",
      timeout: 0,
    });
  });

  it("forwards copy overrides to the rendered toast", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    renderHook(() =>
      useChannelErrorToasts({
        app: APP,
        docRef: DOC_REF,
        formatTitle: channel => `Sync issue: ${channel}`,
        messages: { [ChannelErrorCode.INTERNAL_ERROR]: "Custom server error copy." },
        toaster,
      })
    );

    const shown = vi.mocked(toaster.show).mock.calls[0]?.[0] as { message: React.ReactElement };
    const { container } = render(shown.message);

    expect(container.textContent).toContain("Sync issue: data");
    expect(container.textContent).toContain("Custom server error copy.");
  });

  it("shows nothing when every channel is healthy", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({}));
    const toaster = createMockToaster();

    renderHook(() => useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster }));

    expect(toaster.show).not.toHaveBeenCalled();
  });

  it("does not re-show an unchanged error when status notifies again", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    const { rerender } = renderHook(() =>
      useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster })
    );
    // New status object, same underlying error -> effect reruns but nothing actually changed.
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
    rerender();

    expect(toaster.show).toHaveBeenCalledTimes(1);
  });

  it("updates the existing toast in place when the error changes", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    const { rerender } = renderHook(() =>
      useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster })
    );
    mockUseDocumentStatus.mockReturnValue(
      statusWith({
        data: {
          ...ERRORED,
          error: { code: ChannelErrorCode.INTERNAL_ERROR, errorInstanceId: "def-456" },
        },
      }),
    );
    rerender();

    expect(toaster.show).toHaveBeenCalledTimes(2);
    // Reuses the first toast's key rather than stacking a second toast.
    expect(vi.mocked(toaster.show).mock.calls[0]?.[1]).toBeUndefined();
    expect(vi.mocked(toaster.show).mock.calls[1]?.[1]).toBe("toast-0");
  });

  it("does not resurrect a toast the user dismissed while the error persists", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    const { rerender } = renderHook(() =>
      useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster })
    );
    // Simulate the user clicking the toast's dismiss control.
    const shown = vi.mocked(toaster.show).mock.calls[0]?.[0] as { onDismiss?: () => void };
    shown.onDismiss?.();

    mockUseDocumentStatus.mockReturnValue(statusWith({ data: { ...ERRORED } }));
    rerender();

    expect(toaster.show).toHaveBeenCalledTimes(1);
  });

  it("shows again after dismissal if a different error arrives", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    const { rerender } = renderHook(() =>
      useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster })
    );
    const shown = vi.mocked(toaster.show).mock.calls[0]?.[0] as { onDismiss?: () => void };
    shown.onDismiss?.();

    mockUseDocumentStatus.mockReturnValue(
      statusWith({
        data: {
          ...ERRORED,
          error: {
            code: ChannelErrorCode.INTERNAL_ERROR,
            errorInstanceId: "abc-123",
            message: "something new",
          },
        },
      }),
    );
    rerender();

    expect(toaster.show).toHaveBeenCalledTimes(2);
    // No live toast to update, so it opens a fresh one.
    expect(vi.mocked(toaster.show).mock.calls[1]?.[1]).toBeUndefined();
  });

  it("dismisses the toast once the channel recovers", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));
    const toaster = createMockToaster();

    const { rerender } = renderHook(() =>
      useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster })
    );
    mockUseDocumentStatus.mockReturnValue(statusWith({}));
    rerender();

    expect(toaster.dismiss).toHaveBeenCalledWith("toast-0");
  });

  it("tracks each failing channel separately", () => {
    mockUseDocumentStatus.mockReturnValue(
      statusWith({ data: ERRORED, presence: ERRORED }),
    );
    const toaster = createMockToaster();

    renderHook(() => useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster }));

    expect(toaster.show).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the toaster is still being created", () => {
    mockUseDocumentStatus.mockReturnValue(statusWith({ data: ERRORED }));

    // Should not throw when passed null.
    renderHook(() => useChannelErrorToasts({ app: APP, docRef: DOC_REF, toaster: null }));
  });
});
