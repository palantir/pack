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
import { generateVersionedTypesFromSchema } from "../generateVersionedTypesFromSchema.js";
import {
  singleVersionSchema,
  threeVersionChainSchema,
  twoVersionAdditiveSchema,
  twoVersionFieldRemovalSchema,
} from "./fixtures.js";
import { formatWithPrettier } from "./formatWithPrettier.js";

describe("generateVersionedTypesFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateVersionedTypesFromSchema");

  it("single-version schema", async () => {
    const result = generateVersionedTypesFromSchema(singleVersionSchema);

    await expect(await formatWithPrettier(result.readTypes.get(1)!)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "types_v1.ts"),
    );
    await expect(await formatWithPrettier(result.writeTypes.get(1)!)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "writeTypes_v1.ts"),
    );
    await expect(await formatWithPrettier(result.typesReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version", "types.ts"),
    );
  });

  it("two-version additive change", async () => {
    const result = generateVersionedTypesFromSchema(twoVersionAdditiveSchema, 1);

    for (const [version, content] of result.readTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-additive", `types_v${version}.ts`),
      );
    }
    for (const [version, content] of result.writeTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-additive", `writeTypes_v${version}.ts`),
      );
    }
    await expect(await formatWithPrettier(result.typesReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-additive", "types.ts"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateVersionedTypesFromSchema(twoVersionFieldRemovalSchema, 1);

    for (const [version, content] of result.readTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-field-removal", `types_v${version}.ts`),
      );
    }
    for (const [version, content] of result.writeTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "two-version-field-removal", `writeTypes_v${version}.ts`),
      );
    }
    await expect(await formatWithPrettier(result.typesReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal", "types.ts"),
    );
  });

  it("three-version chain", async () => {
    const result = generateVersionedTypesFromSchema(threeVersionChainSchema, 1);

    for (const [version, content] of result.readTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "three-version-chain", `types_v${version}.ts`),
      );
    }
    for (const [version, content] of result.writeTypes) {
      await expect(await formatWithPrettier(content)).toMatchFileSnapshot(
        path.join(snapshotDir, "three-version-chain", `writeTypes_v${version}.ts`),
      );
    }
    await expect(await formatWithPrettier(result.typesReExport)).toMatchFileSnapshot(
      path.join(snapshotDir, "three-version-chain", "types.ts"),
    );
  });

  it("respects minSupportedVersion default (latest only)", () => {
    const result = generateVersionedTypesFromSchema(twoVersionAdditiveSchema);

    expect(result.readTypes.size).toBe(1);
    expect(result.readTypes.has(2)).toBe(true);
    expect(result.readTypes.has(1)).toBe(false);
  });
});
