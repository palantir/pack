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
import { generateInternalFromSchema } from "../generateInternalFromSchema.js";
import {
  nestedOptionalsSchema,
  singleVersionSchema,
  twoVersionFieldRemovalSchema,
} from "./fixtures.js";
import { formatInternalTypesSnapshot } from "./snapshotUtils.js";

describe("generateInternalFromSchema", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateInternalFromSchema");

  it("single-version schema", async () => {
    const result = generateInternalFromSchema(singleVersionSchema);
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "single-version.snap"),
    );
  });

  it("nested optionals inside arrays", async () => {
    const result = generateInternalFromSchema(nestedOptionalsSchema);
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "nested-optionals.snap"),
    );
  });

  it("two-version field removal", async () => {
    const result = generateInternalFromSchema(twoVersionFieldRemovalSchema);
    await expect(await formatInternalTypesSnapshot(result)).toMatchFileSnapshot(
      path.join(snapshotDir, "two-version-field-removal.snap"),
    );
  });
});
