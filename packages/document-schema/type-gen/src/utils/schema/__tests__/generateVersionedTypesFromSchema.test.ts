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
import { generateVersionedTypesFromChain } from "../generateVersionedTypesFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import {
  aliasedEntryNameSchema,
  nestedUnionSchema,
  refFieldsSchema,
  singleVersionSchema,
  threeVersionChainSchema,
  twoVersionAdditiveSchema,
  twoVersionFieldRemovalSchema,
  unionTypesSchema,
} from "./fixtures.js";
import { formatVersionedTypesSnapshot } from "./snapshotUtils.js";

describe("generateVersionedTypesFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionedTypesFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(singleVersionSchema));
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("two-version additive change", async () => {
    const result = generateVersionedTypesFromChain(
      resolveSchemaChain(twoVersionAdditiveSchema, 1),
      1,
    );
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateVersionedTypesFromChain(
      resolveSchemaChain(twoVersionFieldRemovalSchema, 1),
      1,
    );
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("three-version chain", async () => {
    const result = generateVersionedTypesFromChain(
      resolveSchemaChain(threeVersionChainSchema, 1),
      1,
    );
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain.snap"),
    );
  });

  it("schema with ref fields", async () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(refFieldsSchema));
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "ref-fields.snap"),
    );
  });

  it("schema with union types", async () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(unionTypesSchema));
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-types.snap"),
    );
  });

  it("preserves aliased export name when export key differs from model name", async () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(aliasedEntryNameSchema));
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "alias-types.snap"),
    );
  });

  it("includes value field for union variants that reference another union", async () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(nestedUnionSchema));
    await expect(await formatVersionedTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "union-reference-union.snap"),
    );
  });

  it("respects minSupportedVersion default (latest only)", () => {
    const result = generateVersionedTypesFromChain(resolveSchemaChain(twoVersionAdditiveSchema));
    expect(result.readTypes.size).toBe(1);
    expect(result.readTypes.has(2)).toBe(true);
    expect(result.readTypes.has(1)).toBe(false);
  });
});
