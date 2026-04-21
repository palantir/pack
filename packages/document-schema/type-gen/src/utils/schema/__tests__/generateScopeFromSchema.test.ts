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
import { generateScopeFromSchema } from "../generateScopeFromSchema.js";
import { singleVersionSchema, twoVersionFieldRemovalSchema, unionSchema } from "./fixtures.js";
import { formatWithPrettier } from "./formatWithPrettier.js";

describe("generateScopeFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateScopeFromSchema");

  it("single-version schema", async () => {
    const result = generateScopeFromSchema(singleVersionSchema);

    await expect(await formatWithPrettier(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "versionedDocRef.ts"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateScopeFromSchema(twoVersionFieldRemovalSchema, 1);

    await expect(await formatWithPrettier(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "versionedDocRef.ts"),
    );
  });

  it("union schema", async () => {
    const result = generateScopeFromSchema(unionSchema);

    await expect(await formatWithPrettier(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union", "versionedDocRef.ts"),
    );
  });
});
