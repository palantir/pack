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

export async function lazyLoadCometD(): Promise<typeof cometd> {
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

  return { ...resolved, AckExtension };
}
