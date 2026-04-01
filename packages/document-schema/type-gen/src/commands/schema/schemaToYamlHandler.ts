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

import type { VersionedSchema } from "@palantir/pack.schema";
import { getSchemaVersionMetadata } from "@palantir/pack.schema";
import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import {
  convertSchemaToSteps,
  convertStepsToYamlString,
  convertVersionedSchemaToSteps,
} from "../../utils/schema/convertSchemaToSteps.js";
import {
  extractSchemaModuleDefault,
  extractValidSchema,
} from "../../utils/schema/validateSchemaModule.js";

interface SchemaToYamlOptions {
  input: string;
  output: string;
}

export async function schemaToYamlHandler(options: SchemaToYamlOptions): Promise<void> {
  const { input, output } = options;

  try {
    const inputPath = path.resolve(input);

    if (!await fs.pathExists(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    consola.info(`Loading schema from: ${inputPath}`);

    const schemaUrl = pathToFileURL(inputPath).href;
    const schemaModule: unknown = await import(schemaUrl);

    consola.info("Converting schema to YAML...");

    // Check if the module exports a VersionedSchema or a plain ReturnedSchema
    const moduleDefault = extractSchemaModuleDefault(schemaModule);
    const versionMetadata = getSchemaVersionMetadata(moduleDefault);

    let yamlContent: string;
    if (versionMetadata != null) {
      // Versioned schema — emit versioned migration steps
      consola.info(`Detected versioned schema (version ${versionMetadata.version})`);
      const steps = convertVersionedSchemaToSteps(moduleDefault as VersionedSchema);
      yamlContent = convertStepsToYamlString(steps);
    } else {
      // Plain schema — existing behavior
      const schema = extractValidSchema(schemaModule);
      const steps = convertSchemaToSteps(schema);
      yamlContent = convertStepsToYamlString(steps);
    }

    const outputPath = path.resolve(output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, yamlContent, "utf8");

    consola.success(`✅ YAML migration steps written to: ${outputPath}`);
  } catch (error) {
    consola.error("Error converting schema to YAML:", error);
    process.exit(1);
  }
}
