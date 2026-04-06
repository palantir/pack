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

export async function assetDeployHandler(options: AssetDeployOptions): Promise<void> {
  try {
    const assetPath = resolve(options.input);

    consola.info(`Reading asset file from: ${assetPath}`);

    const assetContent = readFileSync(assetPath, "utf8");
    const asset = JSON.parse(assetContent) as DocumentTypeAsset;

    const request = {
      name: asset.documentTypeName,
      ontologyRid: options.ontologyRid,
      storage: asset.documentStorageType,
      fileSystemType: asset.fileSystemType,
      version: asset.schemaVersion,
    };

    consola.info("Creating first-party document type", request);

    // TODO: Update with actual api
    const url = `${options.baseUrl}/api/pack/create-first-party-document-type`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${options.auth}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const result = await response.json();
    consola.success("Successfully created first-party document type", result);
  } catch (error) {
    consola.error("❌ Error during first-party deploy:", error);
    throw new CommanderError(1, "ERRASSETDEPLOY", "Error deploying document type from asset");
  }
}
