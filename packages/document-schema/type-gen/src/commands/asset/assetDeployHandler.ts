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
  CreateFirstPartyDocumentTypeRequest,
  DocumentTypeSchema,
  FileSystemType,
} from "@osdk/foundry.pack";
import { DocumentTypes } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { DocumentTypeAsset } from "../types.js";

interface AssetDeployOptions {
  readonly input: string;
  readonly baseUrl: string;
  readonly auth: string;
  readonly ontologyRid: string;
}

interface AssetFile {
  readonly documentTypeName: string;
  readonly schema: DocumentTypeSchema;
  readonly fileSystemType: FileSystemType;
  readonly schemaVersion: number;
}

export async function assetDeployHandler(options: AssetDeployOptions): Promise<void> {
  try {
    const assetPath = resolve(options.input);

    consola.info(`Reading asset file from: ${assetPath}`);

    const assetContent = readFileSync(assetPath, "utf8");
    const asset = JSON.parse(assetContent) as DocumentTypeAsset;

    const osdkClient = createPlatformClient(
      options.baseUrl,
      () => Promise.resolve(options.auth),
    );

    const request: CreateFirstPartyDocumentTypeRequest = {
      requestBody: {
        name: asset.documentTypeName,
        ontologyRid: options.ontologyRid,
        schema: asset.documentStorageType.yjs,
        fileSystemType: asset.fileSystemType,
        version: asset.schemaVersion,
      },
    };

    consola.info("Creating first-party document type", request);

    const result = await DocumentTypes.createFirstParty(osdkClient, request, { preview: true });

    consola.success("Successfully created first-party document type", result);
  } catch (error) {
    if (error instanceof PalantirApiError) {
      const { message, errorName, errorCode } = error;
      const details = [errorName, errorCode].filter(Boolean).join(" ");
      consola.error(
        `❌ Error during first-party deploy: ${message}${details ? ` [${details}]` : ""}`,
      );
    } else {
      consola.error("❌ Error during first-party deploy:", error);
    }
    throw new CommanderError(1, "ERRASSETDEPLOY", "Error deploying document type from asset");
  }
}
