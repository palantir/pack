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

/**
 * Wraps a host client factory in a memoizing resolver for {@link AppConfig.getClient}.
 *
 * - A no-arg call, or a call for `defaultOntologyRid`, returns `bootClient` directly (the boot
 *   client already serves the default ontology, so no second client is minted for it).
 * - Any other ontology is minted via `factory(ontologyRid)` once and cached.
 *
 * The cache lives in this closure (one per app config, garbage-collected with it), so there is no
 * shared module-level state and no cross-app leakage.
 */
export function createMemoizedClientResolver(
  factory: (ontologyRid: string) => Client,
  bootClient: Client,
  defaultOntologyRid: string,
): (ontologyRid?: string) => Client {
  const cache = new Map<string, Client>();
  return (ontologyRid?: string): Client => {
    if (ontologyRid == null || ontologyRid === defaultOntologyRid) {
      return bootClient;
    }
    let client = cache.get(ontologyRid);
    if (client == null) {
      client = factory(ontologyRid);
      cache.set(ontologyRid, client);
    }
    return client;
  };
}
