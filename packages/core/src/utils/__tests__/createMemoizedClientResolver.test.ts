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
import { createMemoizedClientResolver } from "../createMemoizedClientResolver.js";

const DEFAULT_ONTOLOGY = "ri.ontology.main.ontology.default";
const ONTOLOGY_A = "ri.ontology.main.ontology.a";
const ONTOLOGY_B = "ri.ontology.main.ontology.b";

function fakeClient(label: string): Client {
  return { __label: label } as unknown as Client;
}

function createResolver(): {
  resolve: (ontologyRid?: string) => Client;
  bootClient: Client;
  factory: ReturnType<typeof vi.fn>;
} {
  const bootClient = fakeClient("boot");
  const factory = vi.fn((ontologyRid: string) => fakeClient(`for:${ontologyRid}`));
  const resolve = createMemoizedClientResolver(factory, bootClient, DEFAULT_ONTOLOGY);
  return { resolve, bootClient, factory };
}

describe("createMemoizedClientResolver", () => {
  it("returns the boot client when ontologyRid is omitted", () => {
    const { resolve, bootClient, factory } = createResolver();

    expect(resolve()).toBe(bootClient);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns the boot client (no minting) when the requested ontology is the default", () => {
    const { resolve, bootClient, factory } = createResolver();

    expect(resolve(DEFAULT_ONTOLOGY)).toBe(bootClient);
    expect(factory).not.toHaveBeenCalled();
  });

  it("mints a client via the factory for a non-default ontology", () => {
    const { resolve, factory } = createResolver();

    const client = resolve(ONTOLOGY_A);

    expect(factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
    expect(client).toBe(factory.mock.results[0]!.value);
  });

  it("caches the minted client per ontology (factory called once across repeated calls)", () => {
    const { resolve, factory } = createResolver();

    const first = resolve(ONTOLOGY_A);
    const second = resolve(ONTOLOGY_A);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("mints a separate client per distinct ontology", () => {
    const { resolve, factory } = createResolver();

    const clientA = resolve(ONTOLOGY_A);
    const clientB = resolve(ONTOLOGY_B);

    expect(clientA).not.toBe(clientB);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenNthCalledWith(1, ONTOLOGY_A);
    expect(factory).toHaveBeenNthCalledWith(2, ONTOLOGY_B);
  });

  it("does not share its cache across resolvers", () => {
    const one = createResolver();
    const two = createResolver();

    one.resolve(ONTOLOGY_A);
    two.resolve(ONTOLOGY_A);

    // Each resolver has its own cache closure; a shared cache would have let `two` reuse `one`'s
    // client and skip the second factory call.
    expect(one.factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
    expect(two.factory).toHaveBeenCalledExactlyOnceWith(ONTOLOGY_A);
  });
});
