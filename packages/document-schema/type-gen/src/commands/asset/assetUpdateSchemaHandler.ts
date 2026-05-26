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

import { createPlatformClient, PalantirApiError } from "@osdk/client";
import type { UpdateSchemaDocumentTypeRequest } from "@osdk/foundry.pack";
import { DocumentTypes } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { DocumentTypeAsset } from "../types.js";
import { buildPrefixRewriteFetch } from "./assetDeployHandler.js";

interface AssetUpdateSchemaOptions {
  readonly input: string;
  readonly baseUrl: string;
  readonly auth: string;
  readonly ontologyRid: string;
  readonly forceOverwrite?: boolean;
  readonly firstPartyPrefix?: string;
}

const DEFAULT_API_PREFIX = "/api";

/** Updates the schema of an existing document type using a generated asset JSON file. */
export async function assetUpdateSchemaHandler(
  options: AssetUpdateSchemaOptions,
): Promise<void> {
  try {
    const assetPath = resolve(options.input);

    consola.info(`Reading asset file from: ${assetPath}`);

    const assetContent = readFileSync(assetPath, "utf8");
    const asset = JSON.parse(assetContent) as DocumentTypeAsset;

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

    const request: UpdateSchemaDocumentTypeRequest = {
      documentTypeName: asset.documentTypeName,
      requestBody: {
        ontologyRid: options.ontologyRid,
        schema: asset.documentStorageType.yjs.schema,
        version: asset.schemaVersion,
        ...(options.forceOverwrite ? { forceOverwrite: true } : {}),
      },
    };

    if (options.forceOverwrite) {
      consola.warn("--force-overwrite is set: backwards-compatibility validation will be skipped.");
    }

    consola.info(
      `Updating schema for document type "${asset.documentTypeName}" -> version ${asset.schemaVersion}`,
    );

    const result = await DocumentTypes.updateSchema(osdkClient, request, { preview: true });

    if (result.type === "success") {
      consola.success(`Schema updated successfully (version ${result.version})`);
      return;
    }

    consola.error(`Schema validation failed with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      consola.error(`  - ${violation.fieldPath}\t${violation.violationType}\t${violation.message}`);
    }
    consola.info("Hint: re-run with --force-overwrite to skip validation.");
    throw new CommanderError(
      1,
      "ERRSCHEMAVALIDATION",
      "Schema validation failed during update",
    );
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    if (error instanceof PalantirApiError) {
      const { message, errorName, errorCode } = error;
      const details = [errorName, errorCode].filter(Boolean).join(" ");
      consola.error(
        `❌ Error during schema update: ${message}${details ? ` [${details}]` : ""}`,
      );
    } else {
      consola.error("❌ Error during schema update:", error);
    }
    throw new CommanderError(1, "ERRASSETUPDATESCHEMA", "Error updating document type schema");
  }
}
