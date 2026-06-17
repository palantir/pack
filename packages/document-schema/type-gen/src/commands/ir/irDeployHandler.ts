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
import type {
  CreateDocumentTypeRequest,
  CreateFirstPartyDocumentTypeRequest,
} from "@osdk/foundry.pack";
import { DocumentTypes } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { readFileSync } from "fs";
import { resolve } from "path";
import { convertIrToWireSchema } from "../../utils/ir/convertIrToWireSchema.js";
import type { FileSystemType } from "../types.js";
import { buildPrefixRewriteFetch, DEFAULT_API_PREFIX } from "../utils/firstPartyPrefix.js";
import { resolveIrInput } from "./resolveIrInput.js";

interface DeployOptions {
  readonly ir: string;
  readonly baseUrl: string;
  readonly auth: string;
  readonly fileSystemType?: FileSystemType;
  readonly firstParty?: boolean;
  /** Required for third-party deploys. */
  readonly parentFolder?: string;
  /** Required for first-party deploys. */
  readonly ontologyRid?: string;
  /** Overrides the API prefix for first-party deploys (e.g. /api/gotham). */
  readonly firstPartyPrefix?: string;
}

export async function irDeployHandler(options: DeployOptions): Promise<void> {
  try {
    const irPath = resolve(options.ir);
    consola.info(`Reading schema from: ${irPath}`);

    const { ir, latestVersion } = resolveIrInput(
      JSON.parse(readFileSync(irPath, "utf8")) as unknown,
      irPath,
    );
    const schema = convertIrToWireSchema(ir);
    const fileSystemType = options.fileSystemType ?? "ARTIFACTS";

    if (options.firstParty) {
      await deployFirstParty(options, ir.name, schema, latestVersion, fileSystemType);
    } else {
      await deployThirdParty(options, ir.name, schema, fileSystemType);
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    consola.error("❌ Error during Deploy:", error);
    throw new CommanderError(1, "ERRIRMDEPLOY", "Error deploying IR document schema");
  }
}

type DocumentTypeSchema = CreateDocumentTypeRequest["schema"];

async function deployThirdParty(
  options: DeployOptions,
  name: string,
  schema: DocumentTypeSchema,
  fileSystemType: FileSystemType,
): Promise<void> {
  if (options.parentFolder == null) {
    throw new CommanderError(
      1,
      "EINVAL",
      "--parent-folder is required when deploying a third-party document type",
    );
  }

  const osdkClient = createPlatformClient(options.baseUrl, () => Promise.resolve(options.auth));

  const request: CreateDocumentTypeRequest = {
    name,
    parentFolderRid: options.parentFolder,
    schema,
    fileSystemType,
  };

  consola.info("Creating document type with schema", request);
  await DocumentTypes.create(osdkClient, request, { preview: true });
  consola.success("Successfully created document type");
}

async function deployFirstParty(
  options: DeployOptions,
  name: string,
  schema: DocumentTypeSchema,
  version: number,
  fileSystemType: FileSystemType,
): Promise<void> {
  if (options.ontologyRid == null) {
    throw new CommanderError(
      1,
      "EINVAL",
      "--ontology-rid is required when deploying a first-party document type",
    );
  }

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

  const request: CreateFirstPartyDocumentTypeRequest = {
    requestBody: {
      name,
      ontologyRid: options.ontologyRid,
      schema,
      version,
      fileSystemType,
    },
  };

  consola.info("Creating first-party document type", request);
  try {
    const result = await DocumentTypes.createFirstParty(osdkClient, request, { preview: true });
    consola.success("Successfully created first-party document type", result);
  } catch (error) {
    if (error instanceof PalantirApiError) {
      const { message, errorName, errorCode } = error;
      const details = [errorName, errorCode].filter(Boolean).join(" ");
      consola.error(
        `❌ Error during first-party deploy: ${message}${details ? ` [${details}]` : ""}`,
      );
    }
    throw error;
  }
}
