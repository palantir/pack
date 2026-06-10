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

import { describe, expect, it } from "vitest";
import type { IRealTimeDocumentSchema } from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { resolveIrInput } from "../resolveIrInput.js";

function ir(version: number): IRealTimeDocumentSchema {
  return {
    name: `Test v${version}`,
    description: "Test schema",
    version,
    primaryModelKeys: [],
    models: {},
  };
}

describe("resolveIrInput", () => {
  it("passes through legacy single-version IR", () => {
    const resolved = resolveIrInput(ir(2), "legacy.json");

    expect(resolved).toEqual({
      ir: ir(2),
      latestVersion: 2,
      minSupportedVersion: 2,
    });
  });

  it("selects the latest entry from a versioned IR chain", () => {
    const resolved = resolveIrInput({
      latestVersion: 3,
      minSupportedVersion: 1,
      chain: [
        { version: 1, ir: ir(1) },
        { version: 3, ir: ir(3) },
      ],
    }, "chain.json");

    expect(resolved).toEqual({
      ir: ir(3),
      latestVersion: 3,
      minSupportedVersion: 1,
    });
  });

  it("defaults chain minSupportedVersion to latestVersion", () => {
    const resolved = resolveIrInput({
      latestVersion: 3,
      chain: [
        { version: 1, ir: ir(1) },
        { version: 3, ir: ir(3) },
      ],
    }, "chain.json");

    expect(resolved.minSupportedVersion).toBe(3);
  });

  it("rejects an empty chain", () => {
    expect(() =>
      resolveIrInput({
        latestVersion: 1,
        chain: [],
      }, "empty.json")
    ).toThrow("chain");
  });

  it("rejects a chain with an invalid minSupportedVersion", () => {
    expect(() =>
      resolveIrInput({
        latestVersion: 3,
        minSupportedVersion: 2,
        chain: [
          { version: 1, ir: ir(1) },
          { version: 3, ir: ir(3) },
        ],
      }, "missing.json")
    ).toThrow("minSupportedVersion 2");
  });
});
