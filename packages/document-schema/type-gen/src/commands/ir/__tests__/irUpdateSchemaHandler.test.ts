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

import { consola } from "consola";
import type * as FsModule from "fs";
import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { irUpdateSchemaHandler } from "../irUpdateSchemaHandler.js";

const { updateSchemaMock } = vi.hoisted(() => ({ updateSchemaMock: vi.fn() }));

vi.mock("@osdk/foundry.pack", () => ({ DocumentTypes: { updateSchema: updateSchemaMock } }));

vi.mock("@osdk/client", () => ({ createPlatformClient: vi.fn(() => ({})) }));

vi.mock("fs", async importOriginal => ({
  ...(await importOriginal<typeof FsModule>()),
  readFileSync: vi.fn(),
}));

function ir(version: number) {
  return { name: "Test Document Type", version, primaryModelKeys: [], models: {} };
}

function chainPayload(chain: ReadonlyArray<{ version: number; minorVersion?: number }>): string {
  return JSON.stringify({
    latestVersion: chain[chain.length - 1]!.version,
    chain: chain.map(entry => ({ ...entry, ir: ir(entry.version) })),
  });
}

const OPTIONS = {
  ir: "ir.json",
  baseUrl: "https://stack.example.com",
  auth: "test-token",
  ontologyRid: "ri.ontology.main.ontology.test",
} as const;

function sentRequestBody(): Record<string, unknown> {
  const request = updateSchemaMock.mock.calls[0]![1] as { requestBody: Record<string, unknown> };
  return request.requestBody;
}

describe("irUpdateSchemaHandler", () => {
  beforeEach(() => {
    updateSchemaMock.mockResolvedValue({ type: "success", version: 1 });
    vi.spyOn(consola, "info").mockImplementation(() => {});
    vi.spyOn(consola, "success").mockImplementation(() => {});
    vi.spyOn(consola, "warn").mockImplementation(() => {});
    vi.spyOn(consola, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    updateSchemaMock.mockReset();
  });

  it("sends schemaMinorVersion for a minor version", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      chainPayload([{ version: 1 }, { version: 1, minorVersion: 1 }]),
    );

    await irUpdateSchemaHandler({ ...OPTIONS });

    expect(sentRequestBody()).toMatchObject({ version: 1, schemaMinorVersion: 1 });
  });
});
