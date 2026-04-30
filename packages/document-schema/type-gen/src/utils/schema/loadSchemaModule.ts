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

import type { InitialSchema, SchemaDefinition } from "@palantir/pack.schema";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import { extractValidSchema } from "./validateSchemaModule.js";

/**
 * Pull a `SchemaDefinition` out of an imported module. Accepts either a chain
 * built via `defineSchemaUpdate(...)` (`type: "initial" | "versioned"`) or a
 * plain `ModelDefs` object exported as `default` (which is wrapped in an
 * `InitialSchema` at version 1).
 */
export function extractSchemaDefinition(schemaModule: unknown): SchemaDefinition {
  const mod = schemaModule as Record<string, unknown>;
  const defaultExport = mod.default;

  if (
    typeof defaultExport === "object" && defaultExport != null
    && "type" in defaultExport
    && (defaultExport.type === "initial" || defaultExport.type === "versioned")
  ) {
    return defaultExport as SchemaDefinition;
  }

  const models = extractValidSchema(schemaModule);
  return { type: "initial", version: 1, models } satisfies InitialSchema;
}

/**
 * Resolve and import a schema module from a file path, returning a
 * `SchemaDefinition` ready for IR resolution.
 */
export async function loadSchemaModule(filePath: string): Promise<SchemaDefinition> {
  const inputPath = path.resolve(filePath);
  if (!(await fs.pathExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  const schemaModule: unknown = await import(pathToFileURL(inputPath).href);
  return extractSchemaDefinition(schemaModule);
}
