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
import { generateDocumentTypeFromChain } from "../generateDocumentTypeFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import { singleVersionSchema } from "./fixtures.js";
import { formatSingleSnapshot } from "./snapshotUtils.js";

describe("generateDocumentTypeFromChain", () => {
  const snapshotDir = path.join(__dirname, "__snapshots__", "generateDocumentTypeFromSchema");

  it("emits both name and description when identity is provided", async () => {
    const resolved = resolveSchemaChain(singleVersionSchema, undefined, {
      name: "Canvas Document",
      description: "Schema for the Demo Canvas Application",
    });
    const result = generateDocumentTypeFromChain(resolved);
    await expect(await formatSingleSnapshot("documentType.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "with-name-and-description.ts"),
    );
  });

  it("omits description when identity has no description", async () => {
    const resolved = resolveSchemaChain(singleVersionSchema, undefined, {
      name: "Canvas Document",
    });
    const result = generateDocumentTypeFromChain(resolved);
    await expect(await formatSingleSnapshot("documentType.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "name-only.ts"),
    );
  });

  it("falls back to convertSchemaToIr defaults when identity is omitted", async () => {
    const resolved = resolveSchemaChain(singleVersionSchema);
    const result = generateDocumentTypeFromChain(resolved);
    await expect(await formatSingleSnapshot("documentType.ts", result)).toMatchFileSnapshot(
      path.join(snapshotDir, "no-identity-fallback.ts"),
    );
  });
});
