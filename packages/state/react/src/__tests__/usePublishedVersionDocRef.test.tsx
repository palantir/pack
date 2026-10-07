/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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
import type {
  DocumentRef,
  PublishedVersionDocumentRef,
  PublishedVersionRef,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mock, mockDeep, mockReset } from "vitest-mock-extended";
import { usePublishedVersionDocRef } from "../hooks/usePublishedVersionDocRef.js";

const app = mockDeep<WithStateModule<PackApp>>();
const liveDraft = mock<DocumentRef>({ id: "doc-1" });
const versionOne = mock<PublishedVersionDocumentRef>();
const versionTwo = mock<PublishedVersionDocumentRef>();

beforeEach(() => mockReset(app));
afterEach(cleanup);

function renderPublishedVersionDocRef(initialRef: PublishedVersionRef | undefined) {
  return renderHook(
    ({ versionRef }) =>
      usePublishedVersionDocRef(
        app,
        liveDraft,
        versionRef != null ? { type: "specific", publishedVersionRef: versionRef } : undefined,
      ),
    { initialProps: { versionRef: initialRef } },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("usePublishedVersionDocRef", () => {
  it("is idle without a version, then loads the requested version", async () => {
    const load = app.state.loadPublishedVersionDocRef.mockResolvedValue(versionOne);
    const { rerender, result } = renderPublishedVersionDocRef(undefined);

    expect(result.current.status).toBe("idle");
    expect(result.current.publishedVersionDocRef).toBeUndefined();
    expect(load).not.toHaveBeenCalled();

    rerender({ versionRef: "v1" });
    expect(result.current.status).toBe("loading");
    expect(result.current.publishedVersionDocRef).toBeUndefined();
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });
    expect(result.current.publishedVersionDocRef).toBe(versionOne);
    expect(load.mock.calls).toEqual([[liveDraft, "v1"]]);

    rerender({ versionRef: undefined });
    expect(result.current.status).toBe("idle");
    expect(result.current.publishedVersionDocRef).toBeUndefined();
  });

  it("reports load errors", async () => {
    app.state.loadPublishedVersionDocRef.mockRejectedValue(new Error("PublishedVersionNotFound"));
    const { result } = renderPublishedVersionDocRef("missing");

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error?.message).toBe("PublishedVersionNotFound");
  });

  it("loads the version again on refresh, for example after an error", async () => {
    const load = app.state.loadPublishedVersionDocRef
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(versionOne);
    const { result } = renderPublishedVersionDocRef("v1");
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    act(() => result.current.refresh());
    await waitFor(() => {
      expect(result.current.publishedVersionDocRef).toBe(versionOne);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never returns an older version while a newer one is requested", async () => {
    const first = deferred<PublishedVersionDocumentRef>();
    const second = deferred<PublishedVersionDocumentRef>();
    app.state.loadPublishedVersionDocRef
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender, result } = renderPublishedVersionDocRef("v1");

    rerender({ versionRef: "v2" });
    await act(async () => {
      first.resolve(versionOne);
      await first.promise;
    });
    expect(result.current.status).toBe("loading");

    await act(async () => {
      second.resolve(versionTwo);
      await second.promise;
    });
    expect(result.current.status).toBe("loaded");
    expect(result.current.publishedVersionDocRef).toBe(versionTwo);
  });
});

describe("usePublishedVersionDocRef with latest", () => {
  it("loads the latest version", async () => {
    const load = app.state.loadLatestPublishedVersionDocRef.mockResolvedValue(versionOne);
    const { result } = renderHook(() =>
      usePublishedVersionDocRef(app, liveDraft, { type: "latest" })
    );

    expect(result.current.status).toBe("loading");
    expect(result.current.publishedVersionDocRef).toBeUndefined();
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });
    expect(result.current.publishedVersionDocRef).toBe(versionOne);
    expect(load.mock.calls).toEqual([[liveDraft]]);
  });

  it("reports an error when the document has no published versions", async () => {
    const load = app.state.loadLatestPublishedVersionDocRef.mockRejectedValue(
      new Error("NoActivePublishedVersion"),
    );
    const { result } = renderHook(() =>
      usePublishedVersionDocRef(app, liveDraft, { type: "latest" })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error?.message).toBe("NoActivePublishedVersion");
    expect(load).toHaveBeenCalledOnce();
  });

  it("checks again which version is latest on refresh", async () => {
    const load = app.state.loadLatestPublishedVersionDocRef
      .mockResolvedValueOnce(versionOne)
      .mockResolvedValueOnce(versionTwo);
    const { result } = renderHook(() =>
      usePublishedVersionDocRef(app, liveDraft, { type: "latest" })
    );
    await waitFor(() => {
      expect(result.current.publishedVersionDocRef).toBe(versionOne);
    });

    act(() => result.current.refresh());
    // The current version stays on screen until the newer one arrives.
    expect(result.current.publishedVersionDocRef).toBe(versionOne);
    await waitFor(() => {
      expect(result.current.publishedVersionDocRef).toBe(versionTwo);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("loads the new document's latest version when the document changes", async () => {
    const docTwo = mock<DocumentRef>({ id: "doc-2" });
    const load = app.state.loadLatestPublishedVersionDocRef.mockResolvedValue(versionOne);
    const { rerender, result } = renderHook(
      ({ doc }) => usePublishedVersionDocRef(app, doc, { type: "latest" }),
      { initialProps: { doc: liveDraft } },
    );
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });

    rerender({ doc: docTwo });
    expect(result.current.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });
    expect(load).toHaveBeenLastCalledWith(docTwo);
  });
});
