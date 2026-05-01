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

import path from "path";
import { describe, expect, it } from "vitest";
import { generateVersionsFromChain } from "../generateVersionsFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import {
  singleVersionSchema,
  threeVersionChainSchema,
  twoVersionAdditiveSchema,
} from "./fixtures.js";
import { formatSingleSnapshot } from "./snapshotUtils.js";

describe("generateVersionsFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionsFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionsFromChain(resolveSchemaChain(singleVersionSchema));
    await expect(await formatSingleSnapshot("versions.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.ts"),
    );
  });

  it("two-version with minSupportedVersion", async () => {
    const result = generateVersionsFromChain(resolveSchemaChain(twoVersionAdditiveSchema, 1), 1);
    await expect(await formatSingleSnapshot("versions.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version.ts"),
    );
  });

  it("three-version chain", async () => {
    const result = generateVersionsFromChain(resolveSchemaChain(threeVersionChainSchema, 1), 1);
    await expect(await formatSingleSnapshot("versions.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain.ts"),
    );
  });
});
