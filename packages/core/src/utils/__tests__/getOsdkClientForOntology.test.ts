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
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../types/AppConfig.js";
import type { PackAppInternal } from "../../types/PackApp.js";
import { getOsdkClientForOntology } from "../getOsdkClientForOntology.js";

const ONTOLOGY_A = "ri.ontology.main.ontology.a";
const ONTOLOGY_B = "ri.ontology.main.ontology.b";

function fakeClient(label: string): Client {
  return { __label: label } as unknown as Client;
}

function createApp(
  overrides: Partial<AppConfig> = {},
): { app: PackAppInternal; primaryClient: Client; factory: ReturnType<typeof vi.fn> } {
  const primaryClient = fakeClient("primary");
  const factory = vi.fn((ontologyRid: string) => fakeClient(`for:${ontologyRid}`));
  const config = {
    osdkClient: primaryClient,
    createOsdkClientForOntology: factory,
    ...overrides,
  } as unknown as AppConfig;
  return { app: { config } as PackAppInternal, primaryClient, factory };
}

describe("getOsdkClientForOntology", () => {
  it("returns the primary client when ontologyRid is omitted", () => {
    const { app, primaryClient, factory } = createApp();

    expect(getOsdkClientForOntology(app)).toBe(primaryClient);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns the primary client when no factory is configured, even with an ontologyRid", () => {
    const { app, primaryClient } = createApp({ createOsdkClientForOntology: undefined });

    expect(getOsdkClientForOntology(app, ONTOLOGY_A)).toBe(primaryClient);
  });

  it("mints a client via the factory for a requested ontology", () => {
    const { app, factory } = createApp();

    const client = getOsdkClientForOntology(app, ONTOLOGY_A);

    expect(factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
    expect(client).toBe(factory.mock.results[0]!.value);
  });

  it("caches the minted client per ontology (factory called once across repeated calls)", () => {
    const { app, factory } = createApp();

    const first = getOsdkClientForOntology(app, ONTOLOGY_A);
    const second = getOsdkClientForOntology(app, ONTOLOGY_A);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("mints a separate client per distinct ontology", () => {
    const { app, factory } = createApp();

    const clientA = getOsdkClientForOntology(app, ONTOLOGY_A);
    const clientB = getOsdkClientForOntology(app, ONTOLOGY_B);

    expect(clientA).not.toBe(clientB);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenNthCalledWith(1, ONTOLOGY_A);
    expect(factory).toHaveBeenNthCalledWith(2, ONTOLOGY_B);
  });

  it("does not share its cache across apps with different configs", () => {
    const appOne = createApp();
    const appTwo = createApp();

    getOsdkClientForOntology(appOne.app, ONTOLOGY_A);
    getOsdkClientForOntology(appTwo.app, ONTOLOGY_A);

    // Each config has its own factory; a shared module-level cache would have caused appTwo to
    // reuse appOne's client and skip the second factory call.
    expect(appOne.factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
    expect(appTwo.factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
  });
});
