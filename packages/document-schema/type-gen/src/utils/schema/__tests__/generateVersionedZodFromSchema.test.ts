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
  nestedOptionalsSchema,
  refFieldsSchema,
  singleVersionSchema,
  twoVersionAdditiveSchema,
  twoVersionFieldRemovalSchema,
  unionTypesSchema,
} from "./fixtures.js";
import { formatVersionedZodSnapshot } from "./snapshotUtils.js";

describe("generateVersionedZodFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionedZodFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionedZodFromSchema(singleVersionSchema);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("two-version additive change", async () => {
    const result = generateVersionedZodFromSchema(twoVersionAdditiveSchema, 1);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateVersionedZodFromSchema(twoVersionFieldRemovalSchema, 1);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("schema with union types", async () => {
    const result = generateVersionedZodFromSchema(unionTypesSchema);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-types.snap"),
    );
  });

  it("schema with ref fields", async () => {
    const result = generateVersionedZodFromSchema(refFieldsSchema);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "ref-fields.snap"),
    );
  });

  it("nested optionals inside arrays", async () => {
    const result = generateVersionedZodFromSchema(nestedOptionalsSchema);
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "nested-optionals.snap"),
    );
  });

  it("respects minSupportedVersion default (latest only)", () => {
    const result = generateVersionedZodFromSchema(twoVersionAdditiveSchema);
    expect(result.zodSchemas.size).toBe(1);
    expect(result.zodSchemas.has(2)).toBe(true);
    expect(result.zodSchemas.has(1)).toBe(false);
  });
});
