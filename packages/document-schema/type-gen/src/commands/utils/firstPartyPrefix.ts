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

export const DEFAULT_API_PREFIX = "/api";

/**
 * The set of API prefixes that `--first-party-prefix` is allowed to rewrite to.
 * Only `/api/gotham` is supported today; expand this list as new gateways are added.
 */
export const ALLOWED_FIRST_PARTY_PREFIXES = ["/api/gotham"] as const;

/**
 * Builds a fetch wrapper that rewrites the OSDK client's `/api/...` requests
 * to a different prefix (e.g. `/api/gotham`). Used for stacks where the
 * endpoint is served behind a different gateway path instead
 * of the default `/api` route.
 *
 * Throws if `prefix` is not one of {@link ALLOWED_FIRST_PARTY_PREFIXES}.
 */
export function buildPrefixRewriteFetch(prefix: string): typeof globalThis.fetch {
  if (!(ALLOWED_FIRST_PARTY_PREFIXES as readonly string[]).includes(prefix)) {
    throw new Error(
      `Unsupported first-party prefix '${prefix}'. Allowed values: ${
        ALLOWED_FIRST_PARTY_PREFIXES.join(", ")
      }`,
    );
  }
  return (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (
      url.pathname !== DEFAULT_API_PREFIX
      && !url.pathname.startsWith(`${DEFAULT_API_PREFIX}/`)
    ) {
      return globalThis.fetch(req);
    }
    url.pathname = prefix + url.pathname.slice(DEFAULT_API_PREFIX.length);
    return globalThis.fetch(new Request(url, req));
  };
}
