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

import { afterEach, describe, expect, it } from "vitest";
import { lazyLoadCometD } from "../cometd/lazyLoadCometD.js";

/**
 * These tests run in the node environment, which — like a Worker or SharedWorker — provides
 * `WebSocket` but no `window`. That makes it a faithful stand-in for worker scope.
 */
const globalScope = globalThis as { window?: unknown };

/**
 * The alias is gated on `WebSocket`, so that it is only installed where cometd could actually run.
 * Node 20 has no global `WebSocket`, and neither transport cometd offers can work there, so the
 * guard correctly declines and the alias-dependent cases below do not apply.
 */
const hasWebSocket = typeof globalThis.WebSocket === "function";

describe("lazyLoadCometD", () => {
  afterEach(() => {
    delete globalScope.window;
  });

  it("loads cometd in a scope with no window global", async () => {
    expect(globalScope.window).toBeUndefined();

    const loaded = await lazyLoadCometD();

    expect(typeof loaded.CometD).toBe("function");
    // AckExtension is composed in separately; it is the extension PACK actually registers.
    expect(typeof loaded.AckExtension).toBe("function");
  });

  it.skipIf(!hasWebSocket)("aliases window to the global scope", async () => {
    await lazyLoadCometD();

    expect(globalScope.window).toBe(globalThis);
  });

  it.skipIf(!hasWebSocket)(
    "constructs a CometD instance, which reads window.setTimeout",
    async () => {
      const { CometD } = await lazyLoadCometD();

      // Regression guard: cometd reads window.setTimeout during construction, so this threw
      // ReferenceError before the alias existed — before any transport was chosen.
      expect(() => new CometD()).not.toThrow();
    },
  );

  it("does not overwrite an existing window global", async () => {
    const existingWindow = { marker: "real-window" };
    globalScope.window = existingWindow;

    await lazyLoadCometD();

    expect(globalScope.window).toBe(existingWindow);
  });
});
