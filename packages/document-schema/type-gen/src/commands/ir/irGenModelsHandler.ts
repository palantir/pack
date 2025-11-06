/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
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

import type { IRealTimeDocumentSchema } from "@palantir/pack-docschema-api/pack-docschema-ir";
import { CommanderError } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { generateModelsFromIr } from "../../utils/ir/generateModelsFromIr.js";

interface ModelsGenOptions {
  readonly schema: string;
  readonly output: string;
  readonly typeImportPath?: string;
  readonly schemaImportPath?: string;
}

export async function irGenModelsHandler(options: ModelsGenOptions): Promise<void> {
  try {
    const schemaPath = resolve(options.schema);
    const outputPath = resolve(options.output);

    console.log(`Reading schema from: ${schemaPath}`);

    const schemaContent = readFileSync(schemaPath, "utf8");

    // TODO: conjureToZod based validation matches conjure ir
    const schema = JSON.parse(schemaContent) as IRealTimeDocumentSchema;

    console.log(`Generating Model constants for ${schema.primaryModelKeys.length} model(s)...`);

    const generatedCode = await generateModelsFromIr(schema, {
      typeImportPath: options.typeImportPath,
      schemaImportPath: options.schemaImportPath,
    });

    console.log(`Writing generated Model constants to: ${outputPath}`);
    writeFileSync(outputPath, generatedCode, "utf8");

    console.log("✅ Model constants generation completed successfully");
  } catch (error) {
    console.error("❌ Error during Model constants generation:", error);
    throw new CommanderError(1, "ERRIRMODELS", "Error generating Model constants");
  }
}
