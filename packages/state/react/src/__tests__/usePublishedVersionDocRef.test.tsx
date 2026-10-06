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
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePublishedVersionDocRef } from "../hooks/usePublishedVersionDocRef.js";

const liveDraft = { id: "doc-1" } as DocumentRef;
const versionOne = { id: "doc-1", publishedVersion: { ref: "v1" } } as PublishedVersionDocumentRef;
const versionTwo = { id: "doc-1", publishedVersion: { ref: "v2" } } as PublishedVersionDocumentRef;

function createApp(loadPublishedVersionDocRef: unknown): WithStateModule<PackApp> {
  return { state: { loadPublishedVersionDocRef } } as unknown as WithStateModule<PackApp>;
}

function renderPublishedVersionDocRef(
  app: WithStateModule<PackApp>,
  initialRef: PublishedVersionRef | undefined,
) {
  return renderHook(({ versionRef }) => usePublishedVersionDocRef(app, liveDraft, versionRef), {
    initialProps: { versionRef: initialRef },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("usePublishedVersionDocRef", () => {
  it("returns the live draft without a version, then loads the requested version", async () => {
    const load = vi.fn().mockResolvedValue(versionOne);
    const { rerender, result } = renderPublishedVersionDocRef(createApp(load), undefined);

    expect(result.current.status).toBe("liveDraft");
    expect(result.current.docRef).toBe(liveDraft);
    expect(load).not.toHaveBeenCalled();

    rerender({ versionRef: "v1" });
    expect(result.current.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.status).toBe("loaded");
    });
    expect(result.current.docRef).toBe(versionOne);
    expect(load).toHaveBeenCalledWith(liveDraft, "v1");

    rerender({ versionRef: undefined });
    expect(result.current.status).toBe("liveDraft");
    expect(result.current.docRef).toBe(liveDraft);
  });

  it("returns no ref while a version loads, so the live draft isn't shown in its place", () => {
    const load = vi.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderPublishedVersionDocRef(createApp(load), "v1");

    expect(result.current.status).toBe("loading");
    expect(result.current.docRef).toBeUndefined();
  });

  it("reports load errors", async () => {
    const load = vi.fn().mockRejectedValue(new Error("PublishedVersionNotFound"));
    const { result } = renderPublishedVersionDocRef(createApp(load), "missing");

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error?.message).toBe("PublishedVersionNotFound");
  });

  it("never returns an older version while a newer one is requested", async () => {
    const first = deferred<PublishedVersionDocumentRef>();
    const second = deferred<PublishedVersionDocumentRef>();
    const load = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender, result } = renderPublishedVersionDocRef(createApp(load), "v1");

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
    expect(result.current.docRef).toBe(versionTwo);
  });
});
