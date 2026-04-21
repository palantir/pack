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
import { generateVersionedZodFromSchema } from "../generateVersionedZodFromSchema.js";
import {
  singleVersionSchema,
  twoVersionAdditiveSchema,
  twoVersionFieldRemovalSchema,
} from "./fixtures.js";
import { formatWithPrettier } from "./formatWithPrettier.js";

describe("generateVersionedZodFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionedZodFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionedZodFromSchema(singleVersionSchema);

    await expect(await formatWithPrettier(result.zodSchemas.get(1)!)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "schema_v1.ts"),
    );
    await expect(await formatWithPrettier(result.internalSchema)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "_internal_schema.ts"),
    );
    await expect(await formatWithPrettier(result.schemaReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "schema.ts"),
    );
  });

  it("two-version additive change", async () => {
    const result = generateVersionedZodFromSchema(twoVersionAdditiveSchema, 1);

    for (const [version, content] of result.zodSchemas) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-additive", `schema_v${version}.ts`),
      );
    }
    await expect(await formatWithPrettier(result.internalSchema)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive", "_internal_schema.ts"),
    );
    await expect(await formatWithPrettier(result.schemaReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive", "schema.ts"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateVersionedZodFromSchema(twoVersionFieldRemovalSchema, 1);

    for (const [version, content] of result.zodSchemas) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-field-removal", `schema_v${version}.ts`),
      );
    }
    await expect(await formatWithPrettier(result.internalSchema)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "_internal_schema.ts"),
    );
    await expect(await formatWithPrettier(result.schemaReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "schema.ts"),
    );
  });

  it("respects minSupportedVersion default (latest only)", async () => {
    const result = generateVersionedZodFromSchema(twoVersionAdditiveSchema);

    expect(result.zodSchemas.size).toBe(1);
    expect(result.zodSchemas.has(2)).toBe(true);
    expect(result.zodSchemas.has(1)).toBe(false);
  });
});
