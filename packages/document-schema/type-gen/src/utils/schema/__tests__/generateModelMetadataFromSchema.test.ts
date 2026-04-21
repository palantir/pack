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
} from "./fixtures.js";
import { formatJson, formatWithPrettier } from "./formatWithPrettier.js";

describe("generateModelMetadataFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateModelMetadataFromSchema");

  it("single-version schema", async () => {
    const result = generateModelMetadataFromSchema(singleVersionSchema);

    await expect(await formatWithPrettier(result.modelsFile)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "models.ts"),
    );
    await expect(await formatJson(result.schemaManifest)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "schema-manifest.json"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateModelMetadataFromSchema(twoVersionFieldRemovalSchema, 1);

    await expect(await formatWithPrettier(result.modelsFile)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "models.ts"),
    );
    await expect(await formatJson(result.schemaManifest)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "schema-manifest.json"),
    );
  });

  it("three-version chain", async () => {
    const result = generateModelMetadataFromSchema(threeVersionChainSchema, 1);

    await expect(await formatWithPrettier(result.modelsFile)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain", "models.ts"),
    );
    await expect(await formatJson(result.schemaManifest)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain", "schema-manifest.json"),
    );
  });
});
