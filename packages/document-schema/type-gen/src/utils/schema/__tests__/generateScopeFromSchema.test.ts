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
import { generateScopeFromChain } from "../generateScopeFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import { singleVersionSchema, twoVersionFieldRemovalSchema, unionTypesSchema } from "./fixtures.js";
import { formatSingleSnapshot } from "./snapshotUtils.js";

describe("generateScopeFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateScopeFromSchema");

  it("single-version schema", async () => {
    const result = generateScopeFromChain(resolveSchemaChain(singleVersionSchema));
    await expect(await formatSingleSnapshot("versionedDocRef.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateScopeFromChain(resolveSchemaChain(twoVersionFieldRemovalSchema, 1), 1);
    await expect(await formatSingleSnapshot("versionedDocRef.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("union types schema", async () => {
    const result = generateScopeFromChain(resolveSchemaChain(unionTypesSchema));
    await expect(await formatSingleSnapshot("versionedDocRef.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-types.snap"),
    );
  });
});
