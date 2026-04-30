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
import { generateVersionedZodFromChain } from "../generateVersionedZodFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import {
  nestedOptionalsSchema,
  nestedUnionSchema,
  refFieldsSchema,
  singleVersionSchema,
  twoVersionAdditiveSchema,
  twoVersionFieldRemovalSchema,
  unionTypesSchema,
} from "./fixtures.js";
import { formatVersionedZodSnapshot } from "./snapshotUtils.js";

describe("generateVersionedZodFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionedZodFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(singleVersionSchema));
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("two-version additive change", async () => {
    const result = generateVersionedZodFromChain(
      resolveSchemaChain(twoVersionAdditiveSchema, 1),
      1,
    );
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateVersionedZodFromChain(
      resolveSchemaChain(twoVersionFieldRemovalSchema, 1),
      1,
    );
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("schema with union types", async () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(unionTypesSchema));
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-types.snap"),
    );
  });

  it("schema with ref fields", async () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(refFieldsSchema));
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "ref-fields.snap"),
    );
  });

  it("nested optionals inside arrays", async () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(nestedOptionalsSchema));
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "nested-optionals.snap"),
    );
  });

  it("includes value field in Zod schema for union variants that reference another union", async () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(nestedUnionSchema));
    await expect(await formatVersionedZodSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-reference-union.snap"),
    );
  });

  it("respects minSupportedVersion default (latest only)", () => {
    const result = generateVersionedZodFromChain(resolveSchemaChain(twoVersionAdditiveSchema));
    expect(result.zodSchemas.size).toBe(1);
    expect(result.zodSchemas.has(2)).toBe(true);
    expect(result.zodSchemas.has(1)).toBe(false);
  });
});
