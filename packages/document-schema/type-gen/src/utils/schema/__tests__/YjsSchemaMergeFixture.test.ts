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

import fs from "fs-extra";
import path from "path";
import { describe, expect, it } from "vitest";
import { generateModelMetadataFromChain } from "../generateModelMetadataFromSchema.js";
import { generateVersionedTypesFromChain } from "../generateVersionedTypesFromSchema.js";
import { generateVersionedZodFromChain } from "../generateVersionedZodFromSchema.js";
import { resolveSchemaChain } from "../resolveSchemaChain.js";
import { yjsSchemaMergeSchema } from "./fixtures.js";

const GENERATED_FIXTURE_DIR = path.resolve(
  __dirname,
  "fixtures/generated-schema-merge",
);
const REGENERATE_COMMAND =
  "UPDATE_YJS_SCHEMA_MERGE_FIXTURE=true pnpm --dir packages/document-schema/type-gen exec vitest run src/utils/schema/__tests__/YjsSchemaMergeFixture.test.ts";

function generateFixtureFiles(): ReadonlyMap<string, string> {
  const resolved = resolveSchemaChain(yjsSchemaMergeSchema);
  const types = generateVersionedTypesFromChain(resolved);
  const zod = generateVersionedZodFromChain(resolved);
  const models = generateModelMetadataFromChain(resolved);

  return new Map([
    ["types_v1.ts", types.readTypes.get(1)!],
    ["types.ts", types.typesReExport],
    ["schema_v1.ts", zod.zodSchemas.get(1)!],
    ["schema.ts", zod.schemaReExport],
    ["models.ts", models.modelsFile],
  ]);
}

describe("state-core Yjs generated schema fixture", () => {
  it("matches the current generator output byte-for-byte", async () => {
    const generatedFiles = generateFixtureFiles();
    const updateFixture = process.env.UPDATE_YJS_SCHEMA_MERGE_FIXTURE === "true";

    if (updateFixture) {
      await fs.ensureDir(GENERATED_FIXTURE_DIR);
      await Promise.all(
        Array.from(
          generatedFiles,
          ([fileName, contents]) =>
            fs.writeFile(path.join(GENERATED_FIXTURE_DIR, fileName), contents, "utf8"),
        ),
      );
    }

    for (const [fileName, generated] of generatedFiles) {
      const fixturePath = path.join(GENERATED_FIXTURE_DIR, fileName);
      const checkedIn = await fs.readFile(fixturePath, "utf8");
      expect(checkedIn, `${fileName} is stale; regenerate with:\n${REGENERATE_COMMAND}`).toBe(
        generated,
      );
    }
  });
});
