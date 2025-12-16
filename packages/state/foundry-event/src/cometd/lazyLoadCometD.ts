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
  // cometd module does declare the extensions, however they are added to the module as side-effects
  // by importing the submodule extension files. So for any we use we'll need to import them explicitly.
  // Note that this file should be included in package.json "sideEffects" to avoid tree-shaking.

  // @ts-expect-error TS7016: AckExtension.js for side effect only, has no exports and so no definitions to include.
  await import("cometd/AckExtension.js");

  return cometdModule;
}
