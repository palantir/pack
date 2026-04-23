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
import { generateModelMetadataFromSchema } from "../generateModelMetadataFromSchema.js";
import {
  singleVersionSchema,
  threeVersionChainSchema,
  twoVersionFieldRemovalSchema,
  unionTypesSchema,
} from "./fixtures.js";
import { formatModelMetadataSnapshot } from "./snapshotUtils.js";

describe("generateModelMetadataFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateModelMetadataFromSchema");

  it("single-version schema", async () => {
    const result = generateModelMetadataFromSchema(singleVersionSchema);
    await expect(await formatModelMetadataSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateModelMetadataFromSchema(twoVersionFieldRemovalSchema, 1);
    await expect(await formatModelMetadataSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("three-version chain", async () => {
    const result = generateModelMetadataFromSchema(threeVersionChainSchema, 1);
    await expect(await formatModelMetadataSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain.snap"),
    );
  });

  it("union types schema", async () => {
    const result = generateModelMetadataFromSchema(unionTypesSchema);
    await expect(await formatModelMetadataSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-types.snap"),
    );
  });
});
