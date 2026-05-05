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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrefixRewriteFetch } from "../assetDeployHandler.js";

describe("buildPrefixRewriteFetch", () => {
  const originalFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function calledUrl(): string {
    const arg = fetchSpy.mock.calls[0]![0] as Request;
    return arg.url;
  }

  it("rewrites /api/foo to /api/gotham/foo", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/api/foo");
    expect(calledUrl()).toBe("https://stack.example.com/api/gotham/foo");
  });

  it("rewrites bare /api to /api/gotham", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/api");
    expect(calledUrl()).toBe("https://stack.example.com/api/gotham");
  });

  it("preserves query strings on rewritten requests", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/api/foo?x=1&y=2");
    expect(calledUrl()).toBe("https://stack.example.com/api/gotham/foo?x=1&y=2");
  });

  it("does not rewrite paths that only share the /api prefix string", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/apiother/foo");
    expect(calledUrl()).toBe("https://stack.example.com/apiother/foo");
  });

  it("does not rewrite non-/api paths", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/healthz");
    expect(calledUrl()).toBe("https://stack.example.com/healthz");
  });

  it("forwards method and headers from the original request", async () => {
    const wrapped = buildPrefixRewriteFetch("/api/gotham");
    await wrapped("https://stack.example.com/api/foo", {
      method: "POST",
      headers: { "x-custom": "value" },
      body: JSON.stringify({ hello: "world" }),
    });
    const req = fetchSpy.mock.calls[0]![0] as Request;
    expect(req.method).toBe("POST");
    expect(req.headers.get("x-custom")).toBe("value");
    await expect(req.text()).resolves.toBe(JSON.stringify({ hello: "world" }));
  });

  it("throws on an unsupported prefix", () => {
    expect(() => buildPrefixRewriteFetch("/api/other")).toThrow(
      /Unsupported first-party prefix/,
    );
  });

  it("throws on a prefix missing the leading slash", () => {
    expect(() => buildPrefixRewriteFetch("api/gotham")).toThrow(
      /Unsupported first-party prefix/,
    );
  });
});
