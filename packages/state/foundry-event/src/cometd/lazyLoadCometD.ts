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

import type * as cometd from "cometd";

/**
 * cometd resolves its browser globals off `window` rather than `globalThis`: it reads
 * `window.setTimeout` while constructing a CometD instance and `window.WebSocket` when registering
 * transports, so it throws `ReferenceError: window is not defined` in a Worker or SharedWorker
 * before any transport is chosen. Every API it touches on the websocket path exists in worker
 * scope, just not under a global named `window`, so aliasing is sufficient — this is an alias, not
 * a stub.
 *
 * The one thing cometd wants that a worker genuinely lacks is `sessionStorage`, read only by
 * `ReloadExtension.js`, which this package never loads (it loads `AckExtension.js` explicitly).
 *
 * Gated on `WebSocket` being present so we only alias in a scope that can actually support cometd,
 * and never overwrite a real `window`.
 */
function ensureWindowGlobalForCometD(): void {
  if (typeof window !== "undefined" || typeof globalThis.WebSocket !== "function") {
    return;
  }
  (globalThis as { window?: unknown }).window = globalThis;
}

export async function lazyLoadCometD(): Promise<typeof cometd> {
  // Must run before the import: cometd reads `window` as its module body evaluates.
  ensureWindowGlobalForCometD();

  const cometdModule = await import("cometd");

  // When dynamically imported as ESM (e.g. in Vite dev mode where
  // cometd is not pre-bundled), the entire module namespace may be nested under `default`
  // rather than having named exports at the top level. Normalize to always get the flat namespace.
  const resolved: typeof cometd = "CometD" in cometdModule
    ? cometdModule
    : (cometdModule as any).default;

  // cometd's AckExtension.js adds the AckExtension constructor to the cometd module via side-effect
  // mutation. Even though cometd is bundled into this package (via bundleNoExternal in package.json),
  // esbuild's code-split chunks bind ESM named exports at evaluation time, so the mutation from
  // AckExtension.js is not reflected in the cometd chunk's namespace. We must explicitly import
  // the constructor and compose it into the returned module object.
  // @ts-expect-error TS2307: No type declarations for cometd/AckExtension.js, but its default export is the AckExtension constructor
  const { default: AckExtension } = await import("cometd/AckExtension.js");

  // `CometD` is read explicitly rather than left to the spread: when cometd resolves through CJS
  // interop, the module namespace exposes its exports via non-enumerable accessors, so
  // `{ ...resolved }` yields only `default`/`module.exports` and drops the constructor. Property
  // access works, so name the two symbols consumers actually destructure.
  return { ...resolved, AckExtension, CometD: resolved.CometD };
}
