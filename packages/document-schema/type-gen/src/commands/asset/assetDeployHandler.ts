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
import type { CreateFirstPartyDocumentTypeRequest } from "@osdk/foundry.pack";
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
  readonly firstPartyPrefix?: string;
}

const DEFAULT_API_PREFIX = "/api";

/**
 * Builds a fetch wrapper that rewrites the OSDK client's `/api/...` requests
 * to a different prefix (e.g. `/api/gotham`). Used for stacks where the
 * endpoint is served behind a different gateway path instead
 * of the default `/api` route.
 */
function buildPrefixRewriteFetch(prefix: string): typeof globalThis.fetch {
  const normalized = prefix.replace(/\/+$/, "");
  return (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (
      url.pathname !== DEFAULT_API_PREFIX
      && !url.pathname.startsWith(`${DEFAULT_API_PREFIX}/`)
    ) {
      return globalThis.fetch(req);
    }
    url.pathname = normalized + url.pathname.slice(DEFAULT_API_PREFIX.length);
    return globalThis.fetch(new Request(url, req));
  };
}

/** Useful for manually deploying a document type during development to test schema changes. */
export async function assetDeployHandler(options: AssetDeployOptions): Promise<void> {
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
