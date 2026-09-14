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

import { CommanderError } from "commander";
import { consola } from "consola";
import type * as FsModule from "fs";
import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { irDeployHandler } from "../irDeployHandler.js";

const { osdkCreateMock, createPlatformClientMock } = vi.hoisted(() => ({
  osdkCreateMock: vi.fn(),
  createPlatformClientMock: vi.fn(() => ({})),
}));

vi.mock("@osdk/foundry.pack", () => ({ DocumentTypes: { create: osdkCreateMock } }));

vi.mock("@osdk/client", () => ({ createPlatformClient: createPlatformClientMock }));

// Minimal single-version IR: exercises resolveIrInput + convertIrToWireSchema with no models.
const MIN_IR = {
  name: "com.palantir.pack.test.foo",
  version: 1,
  primaryModelKeys: [],
  models: {},
};
const WIRE_SCHEMA = { primaryModelKeys: [], models: {} };

vi.mock("fs", async importOriginal => ({
  ...(await importOriginal<typeof FsModule>()),
  readFileSync: vi.fn(() => JSON.stringify(MIN_IR)),
}));

const FIRST_PARTY_OPTIONS = {
  ir: "ir.json",
  baseUrl: "https://stack.example.com",
  auth: "test-token",
  firstParty: true,
  firstPartyApiUrl: "https://stack.example.com/first-party/api",
} as const;

const PUBLISH_URL = "https://stack.example.com/first-party/api/publish-first-party-document-type";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function fetchCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[0]! as [string, RequestInit];
  return { url: call[0], init: call[1] };
}

function publishedBody(): Record<string, unknown> {
  return JSON.parse(fetchCall().init.body as string) as Record<string, unknown>;
}

function silenceConsola(): void {
  vi.spyOn(consola, "info").mockImplementation(() => {});
  vi.spyOn(consola, "success").mockImplementation(() => {});
  vi.spyOn(consola, "warn").mockImplementation(() => {});
  vi.spyOn(consola, "error").mockImplementation(() => {});
}

describe("irDeployHandler — first-party publish", () => {
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, { name: MIN_IR.name })));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MIN_IR));
    silenceConsola();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("PUTs to the publish endpoint with bearer auth and the yjs storage shape", async () => {
    await irDeployHandler({ ...FIRST_PARTY_OPTIONS });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = fetchCall();
    expect(url).toBe(PUBLISH_URL);
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

    const body = publishedBody();
    expect(body).toMatchObject({
      name: MIN_IR.name,
      storage: { type: "yjs", yjs: { schema: WIRE_SCHEMA } },
      fileSystemType: "ARTIFACTS",
    });
    expect(body).not.toHaveProperty("ontologyRid");
    expect(body).not.toHaveProperty("version");
  });

  it("passes an explicit --file-system-type through", async () => {
    await irDeployHandler({ ...FIRST_PARTY_OPTIONS, fileSystemType: "COMPASS" });

    expect(publishedBody()).toMatchObject({ fileSystemType: "COMPASS" });
  });

  it("normalizes a trailing slash on --first-party-api-url", async () => {
    await irDeployHandler({
      ...FIRST_PARTY_OPTIONS,
      firstPartyApiUrl: "https://stack.example.com/first-party/api/",
    });

    expect(fetchCall().url).toBe(PUBLISH_URL);
  });

  it("fails with a CommanderError when --first-party-api-url is missing", async () => {
    await expect(
      irDeployHandler({
        ir: "ir.json",
        baseUrl: "https://stack.example.com",
        auth: "test-token",
        firstParty: true,
      }),
    ).rejects.toBeInstanceOf(CommanderError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes owningApplicationId when the IR chain payload provides one", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        latestVersion: 1,
        owningApplicationId: "pack-app-123",
        chain: [{ version: 1, ir: MIN_IR }],
      }),
    );

    await irDeployHandler({ ...FIRST_PARTY_OPTIONS });

    expect(publishedBody()).toMatchObject({ owningApplicationId: "pack-app-123" });
  });

  it("omits owningApplicationId when the IR does not provide one", async () => {
    await irDeployHandler({ ...FIRST_PARTY_OPTIONS });

    expect(publishedBody()).not.toHaveProperty("owningApplicationId");
  });

  it("warns about and ignores a deprecated --ontology-rid", async () => {
    await irDeployHandler({
      ...FIRST_PARTY_OPTIONS,
      ontologyRid: "ri.ontology.main.ontology.test",
    });

    expect(consola.warn).toHaveBeenCalledWith(expect.stringContaining("--ontology-rid is ignored"));
    expect(publishedBody()).not.toHaveProperty("ontologyRid");
  });

  it("warns about and ignores a deprecated --first-party-prefix (no prefix rewrite applied)", async () => {
    await irDeployHandler({ ...FIRST_PARTY_OPTIONS, firstPartyPrefix: "/some/prefix" });

    expect(consola.warn).toHaveBeenCalledWith(
      expect.stringContaining("--first-party-prefix is ignored"),
    );
    expect(fetchCall().url).toBe(PUBLISH_URL);
  });

  it("surfaces the Conjure errorName and fails with a CommanderError on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        errorCode: "INVALID_ARGUMENT",
        errorName: "BackpackCollaboration:MissingDocumentTypeSchema",
        errorInstanceId: "err-1",
      }),
    );

    await expect(irDeployHandler({ ...FIRST_PARTY_OPTIONS })).rejects.toBeInstanceOf(
      CommanderError,
    );
    expect(consola.error).toHaveBeenCalledWith(
      expect.stringContaining("BackpackCollaboration:MissingDocumentTypeSchema"),
    );
  });

  it("still fails with a CommanderError when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);

    await expect(irDeployHandler({ ...FIRST_PARTY_OPTIONS })).rejects.toBeInstanceOf(
      CommanderError,
    );
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));
  });
});

describe("irDeployHandler — third-party (regression: unaffected by the swap)", () => {
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, {})));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    osdkCreateMock.mockReset().mockResolvedValue({ rid: "ri.pack.main.type.x" });
    createPlatformClientMock.mockClear();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MIN_IR));
    silenceConsola();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("still deploys via the OSDK DocumentTypes.create path and never hits the publish endpoint", async () => {
    await irDeployHandler({
      ir: "ir.json",
      baseUrl: "https://stack.example.com",
      auth: "test-token",
      parentFolder: "ri.compass.main.folder.abc",
    });

    expect(osdkCreateMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
