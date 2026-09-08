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

import { afterEach, describe, expect, it } from "vitest";
import { getPageEnv, getPageEnvOrThrow } from "../utils/getPageEnv.js";

/** Mutable view of the global scope, so tests can simulate a scope with no `document`. */
const globalScope = globalThis as { document?: unknown };
const realDocument = globalScope.document;

/** Simulate a Worker / Node scope, where `document` is not defined at all. */
function removeDocumentGlobal(): void {
  globalScope.document = undefined;
}

describe("getPageEnv", () => {
  afterEach(() => {
    globalScope.document = realDocument;
    document.head.innerHTML = "";
  });

  it("reads values from meta tags", () => {
    document.head.innerHTML = `
      <meta name="pack-appId" content="my-app" />
      <meta name="osdk-foundryUrl" content="https://example.com" />
      <meta name="pack-demoMode" content="true" />
    `;

    const env = getPageEnv();

    expect(env.appId).toBe("my-app");
    expect(env.baseUrl).toBe("https://example.com");
    expect(env.demoMode).toBe(true);
  });

  it("throws when a meta tag still holds a build placeholder", () => {
    document.head.innerHTML = `<meta name="pack-appId" content="%PACK_APP_ID%" />`;

    expect(() => getPageEnv()).toThrow(/placeholder value/);
  });

  describe("in a non-DOM scope", () => {
    it("returns null values instead of throwing", () => {
      removeDocumentGlobal();

      const env = getPageEnv();

      expect(env.appId).toBeNull();
      expect(env.baseUrl).toBeNull();
      expect(env.clientId).toBeNull();
      expect(env.ontologyRid).toBeNull();
      // demoMode is derived from a string compare, so it is false rather than null.
      expect(env.demoMode).toBe(false);
    });

    it("reports the missing required tags rather than a ReferenceError", () => {
      removeDocumentGlobal();

      expect(() => getPageEnvOrThrow()).toThrow(
        /Missing required page environment meta tags/,
      );
    });
  });
});
