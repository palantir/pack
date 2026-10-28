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

import { createPlatformClient } from "@osdk/client";
import type { UpdateSchemaDocumentTypeRequest, UpdateSchemaRequestBody } from "@osdk/foundry.pack";
import { DocumentTypes } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { readFileSync } from "fs";
import { resolve } from "path";
import { convertIrToWireSchema } from "../../utils/ir/convertIrToWireSchema.js";
import { formatSchemaVersion } from "../../utils/schema/resolveSchemaChain.js";
import { buildPrefixRewriteFetch, DEFAULT_API_PREFIX } from "../utils/firstPartyPrefix.js";
import { resolveIrInput } from "./resolveIrInput.js";

interface IrUpdateSchemaOptions {
  readonly ir: string;
  readonly baseUrl: string;
  readonly auth: string;
  readonly ontologyRid: string;
  readonly forceOverwrite?: boolean;
  readonly firstPartyPrefix?: string;
}

/**
 * Updates the schema of an existing document type from an IR file. Sources the wire schema and version directly from
 * the IR (the same single source of truth used by `ir deploy`), avoiding a separately-generated asset file.
 */
export async function irUpdateSchemaHandler(options: IrUpdateSchemaOptions): Promise<void> {
  try {
    const irPath = resolve(options.ir);
    consola.info(`Reading schema from: ${irPath}`);

    const { ir, latestVersion, latestMinorVersion } = resolveIrInput(
      JSON.parse(readFileSync(irPath, "utf8")) as unknown,
      irPath,
    );
    const schema = convertIrToWireSchema(ir);
    const versionLabel = formatSchemaVersion(latestVersion, latestMinorVersion);

    const fetchFn = options.firstPartyPrefix != null
      ? buildPrefixRewriteFetch(options.firstPartyPrefix)
      : undefined;
    if (fetchFn != null) {
      consola.info(`Rewriting OSDK '${DEFAULT_API_PREFIX}' -> '${options.firstPartyPrefix}'`);
    }

    const osdkClient = createPlatformClient(
      options.baseUrl,
      () => Promise.resolve(options.auth),
      undefined,
      fetchFn,
    );

    const requestBody: UpdateSchemaRequestBody = {
      ontologyRid: options.ontologyRid,
      schema,
      version: latestVersion,
      ...(latestMinorVersion > 0 ? { schemaMinorVersion: latestMinorVersion } : {}),
      ...(options.forceOverwrite ? { forceOverwrite: true } : {}),
    };
    const request: UpdateSchemaDocumentTypeRequest = { documentTypeName: ir.name, requestBody };

    if (options.forceOverwrite) {
      consola.warn("--force-overwrite is set: backwards-compatibility validation will be skipped.");
    }
    consola.info(`Updating schema for document type "${ir.name}" -> version ${versionLabel}`);

    const result = await DocumentTypes.updateSchema(osdkClient, request, { preview: true });

    if (result.type === "success") {
      consola.success(
        `Schema updated successfully (version ${
          formatSchemaVersion(result.version, result.schemaMinorVersion)
        })`,
      );
      return;
    }

    consola.error(`Schema validation failed with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      consola.error(
        `  - ${violation.fieldPath}: ${violation.message} (${violation.violationType})`,
      );
    }
    throw new CommanderError(1, "ERRIRUPDATESCHEMA", "Schema validation failed");
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    consola.error("❌ Error during update-schema:", error);
    throw new CommanderError(1, "ERRIRUPDATESCHEMA", "Error updating schema from IR");
  }
}
