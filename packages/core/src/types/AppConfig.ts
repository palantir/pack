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

  /**
   * Test/demo mode configuration:
   * - `true`: Is in demo mode (always use demo services, ignore real Foundry config)
   * - `false`: Production only (never use demo services)
   *
   * @default false (production mode)
   */
  readonly isDemoMode?: boolean;

  readonly logger: Logger;

  readonly ontologyRid: Promise<string>;
  readonly osdkClient: Client;

  /**
   * Optional factory that mints an OSDK client bound to a specific `ontologyRid`.
   *
   * A single OSDK {@link Client} is bound to one ontology for its lifetime, but document creation
   * is ontology-scoped. Hosts that need to create documents in ontologies other than the one
   * {@link osdkClient} is bound to provide this so PACK can route create
   * calls to the right client. When omitted, all operations use {@link osdkClient}.
   */
  readonly createOsdkClientForOntology?: (ontologyRid: string) => Client;

  readonly remote: {
    readonly packEventsUrl: string;
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
   * Test/demo mode configuration:
   * - `true`: Force demo mode (always use demo services)
   * - `"auto"`: Auto-detect - use demo mode when no real Foundry config in environment, otherwise production
   * - `false`: Production only
   *
   * When `"auto"`, checks for non-localhost FOUNDRY_URL in environment variables.
   *
   * @default Auto-detected: true if no baseUrl, otherwise false
   */
  readonly demoMode?: boolean | "auto";

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

  /**
   * The default ontology to create documents in. Optional: when omitted, PACK falls back to the
   * `osdk-ontologyRid` page-environment meta tag, then to the ontology the OSDK client is bound to.
   * Pass this only to override that default (e.g. to use a different ontology than the client's).
   */
  readonly ontologyRid?: string | Promise<string>;

  /**
   * Optional factory that mints an OSDK client bound to a specific `ontologyRid`, enabling document
   * creation in ontologies other than the one the primary client is bound to. See
   * {@link AppConfig.createOsdkClientForOntology}. When omitted, all operations use the primary client.
   */
  readonly createOsdkClientForOntology?: (ontologyRid: string) => Client;

  readonly remote?: {
    /**
     * Absolute URL of the backpack cometD endpoint. Typically supplied by host
     * environments.
     */
    readonly packEventsUrl?: string;

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
