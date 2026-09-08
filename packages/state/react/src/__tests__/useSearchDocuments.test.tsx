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
import type { DocumentSchema } from "@palantir/pack.document-schema.model-types";
import type { StateModule, WithStateModule } from "@palantir/pack.state.core";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { useSearchDocuments } from "../hooks/useSearchDocuments.js";

const TEST_SCHEMA = {} as DocumentSchema;

type BarePackAppHasState = "state" extends keyof PackApp ? true : false;

describe("useSearchDocuments", () => {
  it("keeps state opt-in at the type level", () => {
    expectTypeOf<BarePackAppHasState>().toEqualTypeOf<false>();
    expectTypeOf<WithStateModule<PackApp>["state"]>().toEqualTypeOf<StateModule>();
  });

  it("forwards document ordering", async () => {
    const searchDocuments = vi.fn().mockResolvedValue({ data: [] });
    const app = { state: { searchDocuments } } as unknown as WithStateModule<PackApp>;

    renderHook(() =>
      useSearchDocuments(
        app,
        "TestType",
        TEST_SCHEMA,
        "Test name",
        25,
        { direction: "DESC", field: "LAST_MODIFIED_TIME" },
      )
    );

    await waitFor(() => {
      expect(searchDocuments).toHaveBeenCalledWith(
        "TestType",
        TEST_SCHEMA,
        {
          documentName: "Test name",
          orderBy: { direction: "DESC", field: "LAST_MODIFIED_TIME" },
          pageSize: 25,
          pageToken: undefined,
        },
      );
    });
  });

  it("does not repeat a search when an inline orderBy value is unchanged", async () => {
    const searchDocuments = vi.fn().mockResolvedValue({ data: [] });
    const app = { state: { searchDocuments } } as unknown as WithStateModule<PackApp>;

    const { rerender } = renderHook(() =>
      useSearchDocuments(
        app,
        "TestType",
        TEST_SCHEMA,
        undefined,
        25,
        { direction: "DESC", field: "LAST_MODIFIED_TIME" },
      )
    );
    await waitFor(() => {
      expect(searchDocuments).toHaveBeenCalledOnce();
    });

    rerender();

    expect(searchDocuments).toHaveBeenCalledOnce();
  });
});
