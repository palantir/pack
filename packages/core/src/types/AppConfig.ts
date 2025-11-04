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

import type { Logger } from "@osdk/api";
import type { Client } from "@osdk/client";
import type { ModuleConfigTuple } from "./PackApp.js";
import type { TokenProvider } from "./TokenProvider.js";

export interface AppConfig {
  readonly app: {
    readonly appId: string;
    readonly appVersion?: string;
  };

  readonly isTestMode: boolean;

  readonly logger: Logger;

  readonly osdkClient: Client;

  readonly remote: {
    readonly packApiPath: string;
    readonly packWsPath: string;
    readonly baseUrl: string;
    readonly fetchFn: typeof globalThis.fetch;
  };
}

export interface AppOptions {
  /**
   * Override the authentication token provider from the OSDK client.
   *
   * @default Uses token provider from OSDK client
   */
  readonly auth?: TokenProvider;

  /**
   * The ID of your application.
   * @default Uses values from page environment meta tags (pack-appId, pack-appVersion)
   */
  readonly app?: {
    readonly appId: string;
    readonly appVersion?: string;
  };

  /**
   * Logger configuration.
   * @see {@link @osdk/client/internal.BrowserLogger} for a richer console logger.
   * @default Log warnings & errors only.
   */
  readonly logger?: Logger;
  readonly logLevel?: "debug" | "error" | "info" | "warn";

  /**
   * Internal testing overrides.
   */
  readonly moduleOverrides?: readonly ModuleConfigTuple[];

  readonly remote?: {
    /**
     * @default "/pack/api"
     */
    readonly packApiPath?: string;

    /**
     * @default "/pack/ws"
     */
    readonly packWsPath?: string;

    /**
     * Override the base URL from the OSDK client.
     *
     * eg "https://example.com"
     *
     * @default Uses base URL from OSDK client
     */
    readonly baseUrl?: string;

    /**
     * Override the fetch function from the OSDK client.
     */
    readonly fetchFn?: typeof globalThis.fetch;
  };
}
