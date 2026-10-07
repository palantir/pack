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
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLatestPublishedVersionDocRef } from "../hooks/useLatestPublishedVersionDocRef.js";

const docOne = { id: "doc-1" } as DocumentRef;
const docTwo = { id: "doc-2" } as DocumentRef;
const versionOne = { id: "doc-1", publishedVersion: { ref: "v1" } } as PublishedVersionDocumentRef;
const versionTwo = { id: "doc-1", publishedVersion: { ref: "v2" } } as PublishedVersionDocumentRef;

function createApp(loadLatestPublishedVersionDocRef: unknown): WithStateModule<PackApp> {
  return { state: { loadLatestPublishedVersionDocRef } } as unknown as WithStateModule<PackApp>;
}

describe("useLatestPublishedVersionDocRef", () => {
  it("loads the latest version", async () => {
    const load = vi.fn().mockResolvedValue(versionOne);
    const { result } = renderHook(() => useLatestPublishedVersionDocRef(createApp(load), docOne));

    expect(result.current.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });
    expect(result.current.docRef).toBe(versionOne);
    expect(load).toHaveBeenCalledWith(docOne);
  });

  it("reports an error when the document has no published versions", async () => {
    const load = vi.fn().mockRejectedValue(new Error("NoActivePublishedVersion"));
    const { result } = renderHook(() => useLatestPublishedVersionDocRef(createApp(load), docOne));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error?.message).toBe("NoActivePublishedVersion");
  });

  it("checks again which version is latest on refresh", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(versionOne)
      .mockResolvedValueOnce(versionTwo);
    const app = createApp(load);
    const { result } = renderHook(() => useLatestPublishedVersionDocRef(app, docOne));
    await waitFor(() => {
      expect(result.current.docRef).toBe(versionOne);
    });

    act(() => result.current.refresh());
    // The current version stays on screen until the newer one arrives.
    expect(result.current.docRef).toBe(versionOne);
    await waitFor(() => {
      expect(result.current.docRef).toBe(versionTwo);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("loads the new document's latest version when the document changes", async () => {
    const load = vi.fn().mockResolvedValue(versionOne);
    const app = createApp(load);
    const { rerender, result } = renderHook(
      ({ doc }) => useLatestPublishedVersionDocRef(app, doc),
      { initialProps: { doc: docOne } },
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
