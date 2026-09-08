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
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { createPackAppContext, PackAppProvider, usePackApp } from "../index.js";

interface TestModule {
  readonly value: string;
}

type TestPackApp = PackApp & { readonly testModule: TestModule };

describe("createPackAppContext", () => {
  it("preserves the configured app type", () => {
    const app: TestPackApp = mockDeep<TestPackApp>();
    const { PackAppProvider, usePackApp } = createPackAppContext(app);

    const { result } = renderHook(() => usePackApp(), { wrapper: PackAppProvider });

    expect(result.current).toBe(app);
    expectTypeOf(result.current.testModule).toEqualTypeOf<TestModule>();
  });

  it("throws when its provider is missing", () => {
    const app: TestPackApp = mockDeep<TestPackApp>();
    const { usePackApp } = createPackAppContext(app);

    expect(() => renderHook(() => usePackApp())).toThrow(
      "usePackApp must be used within a PackApp provider",
    );
  });

  it("returns null when a missing provider is allowed", () => {
    const app: TestPackApp = mockDeep<TestPackApp>();
    const { usePackApp } = createPackAppContext(app);

    const { result } = renderHook(() => usePackApp(false));

    expectTypeOf(result.current).toEqualTypeOf<TestPackApp | null>();
    expect(result.current).toBeNull();
  });
});

describe("default PackApp context", () => {
  it("returns the provided app", () => {
    const app: PackApp = mockDeep<PackApp>();

    function Wrapper({ children }: PropsWithChildren) {
      return <PackAppProvider value={app}>{children}</PackAppProvider>;
    }

    const { result } = renderHook(() => usePackApp(), { wrapper: Wrapper });

    expect(result.current).toBe(app);
  });

  it("returns the provided app when required", () => {
    const app: PackApp = mockDeep<PackApp>();

    function Wrapper({ children }: PropsWithChildren) {
      return <PackAppProvider value={app}>{children}</PackAppProvider>;
    }

    const { result } = renderHook(() => usePackApp(true), { wrapper: Wrapper });

    expectTypeOf(result.current).toEqualTypeOf<PackApp>();
    expect(result.current).toBe(app);
  });

  it("returns null when a missing provider is allowed", () => {
    const { result } = renderHook(() => usePackApp(false));

    expectTypeOf(result.current).toEqualTypeOf<PackApp | null>();
    expect(result.current).toBeNull();
  });
});
