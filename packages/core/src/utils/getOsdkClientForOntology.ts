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

import type { Client } from "@osdk/client";
import type { AppConfig } from "../types/AppConfig.js";
import type { PackApp, PackAppInternal } from "../types/PackApp.js";

const clientCacheByConfig = new WeakMap<AppConfig, Map<string, Client>>();

/**
 * Returns the OSDK client to use for an operation targeting `ontologyRid`.
 *
 * - When `ontologyRid` is omitted, or the host did not provide
 *   {@link AppConfig.createOsdkClientForOntology}, returns the app's primary
 *   {@link AppConfig.osdkClient}. This is the path for single-ontology hosts
 *   and for ontology-agnostic operations (search, get/update/delete by id).
 * - Otherwise lazily creates (and caches) a client bound to the requested ontology.
 */
export function getOsdkClientForOntology(
  app: PackApp | PackAppInternal,
  ontologyRid?: string,
): Client {
  const { config } = app;
  if (ontologyRid == null || config.createOsdkClientForOntology == null) {
    return config.osdkClient;
  }

  let cache = clientCacheByConfig.get(config);
  if (cache == null) {
    cache = new Map<string, Client>();
    clientCacheByConfig.set(config, cache);
  }

  let client = cache.get(ontologyRid);
  if (client == null) {
    client = config.createOsdkClientForOntology(ontologyRid);
    cache.set(ontologyRid, client);
  }
  return client;
}
