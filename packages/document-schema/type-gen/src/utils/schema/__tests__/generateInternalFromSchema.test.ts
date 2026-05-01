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
import { generateInternalFromChain } from "../generateInternalFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import {
  nestedOptionalsSchema,
  nestedUnionSchema,
  optionalToRequiredFieldSchema,
  singleVersionSchema,
  twoVersionDerivedFieldsSchema,
  twoVersionFieldRemovalSchema,
} from "./fixtures.js";
import { formatInternalTypesSnapshot } from "./snapshotUtils.js";

describe("generateInternalFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateInternalFromSchema");

  it("single-version schema", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(singleVersionSchema));
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("nested optionals inside arrays", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(nestedOptionalsSchema));
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "nested-optionals.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(twoVersionFieldRemovalSchema));
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });

  it("two-version derived fields", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(twoVersionDerivedFieldsSchema));
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-derived-fields.snap"),
    );
  });

  it("nested union schema generates upgrade registries for all variant targets", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(nestedUnionSchema));
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "nested-union.snap"),
    );
  });

  it("field optional in v1 and required in v2 stays optional in internal schema", async () => {
    const result = generateInternalFromChain(resolveSchemaChain(optionalToRequiredFieldSchema));
    // "label" is Optional(String) in v1 but String in v2.
    // The internal Zod schema must keep it optional because v1 documents
    // may legitimately omit the field.
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-optional-fields.snap"),
    );
  });
});
