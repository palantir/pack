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

import type { PackAppInternal } from "./PackApp.js";

/**
 * ModuleKey uniquely identifies a module.
 *
 * The key is a symbol and is used to identify the module config.
 * Modules are lazily initialized on first access.
 *
 * @example
 * ```ts
 * const MY_MODULE_ACCESSOR = "myModule";
 *
 * const MY_MODULE_KEY: ModuleKey<MyModule, MyModuleConfig> = {
 *   key: Symbol.for("my.module"),
 *
 *   appMemberName: MY_MODULE_ACCESSOR,
 *   initModule: initMyModule,
 * };
 *
 * const app = initPackApp(
 *   (ontologyRid) => createClient(FOUNDRY_URL, ontologyRid, authClient),
 *   { app: { appId: 'your-app-id' }, ontologyRid: ONTOLOGY_RID },
 * )
 *   // Configure the module via the builder (spread from a config creator for ergonomics):
 *   .with(createMyModuleConfig({ ... config ... }))
 *   .build();
 *
 * // Get the module (manual way)
 * const myModule = app.getModule(MY_MODULE_KEY);
 *
 * // Get the module from app property (available via appMemberName sugar)
 * // You also need to declare the appMemberName on the PackApp interface so the type
 * // system knows it is present. This keeps your module usage limited to where your module
 * // is imported
 * declare module '@palantir/pack.core' {
 *   interface PackApp {
 *     readonly [MY_MODULE_ACCESSOR]?: MyModule;
 *   }
 * }
 * const myModule = app.myModule;
 *
 * ```
 */
export interface ModuleKey<T, TConfig = unknown> {
  /** If set, this module will have a getter installed on the PackApp interface */
  readonly appMemberName?: string;
  readonly key: symbol;
  readonly initModule: (app: PackAppInternal, config?: TConfig) => T;
}
