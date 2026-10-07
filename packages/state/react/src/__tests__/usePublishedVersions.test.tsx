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
import type { DocumentRef, PublishedVersion } from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePublishedVersions } from "../hooks/usePublishedVersions.js";

const docRef = { id: "doc-1" } as DocumentRef;
const first: PublishedVersion = { ref: "v1", createdAt: "2026-09-30T12:00:00Z" };
const second: PublishedVersion = { ref: "v2", createdAt: "2026-09-30T13:00:00Z" };

function createApp(listPublishedVersions: unknown): WithStateModule<PackApp> {
  return { state: { listPublishedVersions } } as unknown as WithStateModule<PackApp>;
}

describe("usePublishedVersions", () => {
  it("loads the versions again on refresh, and keeps them if a refresh fails", async () => {
    const listPublishedVersions = vi.fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second, first])
      .mockRejectedValueOnce(new Error("Network error"));
    const app = createApp(listPublishedVersions);
    const { result } = renderHook(() => usePublishedVersions(app, docRef));

    await waitFor(() => {
      expect(result.current.versions).toEqual([first]);
    });

    act(() => result.current.refresh());
    await waitFor(() => {
      expect(result.current.versions).toEqual([second, first]);
    });

    act(() => result.current.refresh());
    await waitFor(() => {
      expect(result.current.error?.message).toBe("Network error");
    });
    expect(result.current.versions).toEqual([second, first]);
  });

  it("reports load errors", async () => {
    const app = createApp(vi.fn().mockRejectedValue(new Error("Forbidden")));
    const { result } = renderHook(() => usePublishedVersions(app, docRef));

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Forbidden");
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.versions).toBeUndefined();
  });
});
