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

import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { GENERATED_JSON_COMMENT } from "../../utils/generatedFileHeader.js";
import { loadSchemaModule } from "../../utils/schema/loadSchemaModule.js";
import { resolveSchemaChain } from "../../utils/schema/resolveSchemaChain.js";

interface SchemaIrOptions {
  input: string;
  output: string;
}

export async function schemaIrHandler(options: SchemaIrOptions): Promise<void> {
  const { input, output } = options;

  consola.info(`Loading schema from: ${input}`);
  const schema = await loadSchemaModule(input);

  consola.info("Resolving versioned IR chain...");
  const { chain, latestVersion } = resolveSchemaChain(schema);

  const outputPath = path.resolve(output);
  await fs.ensureDir(path.dirname(outputPath));

  const payload = {
    __comment: GENERATED_JSON_COMMENT,
    latestVersion,
    chain,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  consola.success(`Wrote IR chain (${chain.length} version(s)) to: ${outputPath}`);
}
