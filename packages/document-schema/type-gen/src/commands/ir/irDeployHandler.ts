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

import { createPlatformClient } from "@osdk/client";
import type { CreateDocumentTypeRequest, FileSystemType } from "@osdk/foundry.pack";
import { DocumentTypes } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { readFileSync } from "fs";
import { resolve } from "path";
import { convertIrToWireSchema } from "../../utils/ir/convertIrToWireSchema.js";
import { resolveIrInput } from "./resolveIrInput.js";

interface DeployOptions {
  readonly ir: string;
  readonly baseUrl: string;
  readonly auth: string;
  readonly fileSystemType?: FileSystemType;
  readonly firstParty?: boolean;
  /** Required for third-party deploys. */
  readonly parentFolder?: string;
  /** Deprecated/ignored for first-party deploys (publish has no ontology binding); kept so existing invocations don't fail. */
  readonly ontologyRid?: string;
  /** Deprecated/ignored; first-party deploys call Backpack directly (use backpackApiUrl). Kept so existing invocations don't fail. */
  readonly firstPartyPrefix?: string;
  /**
   * Backpack Conjure REST base URL (`backpack-rest`), REQUIRED for first-party deploys. The context
   * path is installation-dependent, so pass the value for your stack (commonly `${baseUrl}/backpack/api`).
   */
  readonly backpackApiUrl?: string;
}

export async function irDeployHandler(options: DeployOptions): Promise<void> {
  try {
    const irPath = resolve(options.ir);
    consola.info(`Reading schema from: ${irPath}`);

    const { ir, owningApplicationId } = resolveIrInput(
      JSON.parse(readFileSync(irPath, "utf8")) as unknown,
      irPath,
    );
    const schema = convertIrToWireSchema(ir);
    const fileSystemType = options.fileSystemType ?? "ARTIFACTS";

    if (options.firstParty) {
      await deployFirstParty(options, ir.name, schema, fileSystemType, owningApplicationId);
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
  const result = await DocumentTypes.create(osdkClient, request, { preview: true });
  consola.success("Successfully created document type", result);
}

/** Subset of Backpack's Conjure error body that we surface to the user. */
interface ConjureErrorBody {
  readonly errorName?: string;
  readonly errorInstanceId?: string;
}

/**
 * Publishes a global, name-keyed first-party document type via Backpack's internal-only
 * `publishFirstPartyDocumentType` endpoint. Backpack is not part of the public Foundry API / OSDK,
 * and its generated client lives in an internal registry this public package cannot depend on, so
 * this is a direct authenticated PUT to the Conjure REST route rather than an OSDK/client call.
 *
 * Records an unversioned dev-mode type: no ontologyRid/version is sent and no RID is returned (the
 * RID is created lazily on first document creation). Note: Backpack rejects a name that already
 * exists as an old-world RID-keyed type until the one-time backfill migrates it into the asset
 * table; new names publish immediately.
 */
async function deployFirstParty(
  options: DeployOptions,
  name: string,
  schema: DocumentTypeSchema,
  fileSystemType: FileSystemType,
  owningApplicationId: string | undefined,
): Promise<void> {
  if (options.backpackApiUrl == null || options.backpackApiUrl.length === 0) {
    throw new CommanderError(
      1,
      "EINVAL",
      "--backpack-api-url is required for first-party deploys. Pass your stack's Backpack REST base "
        + "URL (commonly <base-url>/backpack/api).",
    );
  }
  if (options.ontologyRid != null) {
    consola.warn(
      "--ontology-rid is ignored for first-party deploys: publishFirstPartyDocumentType has no "
        + "ontology binding (the per-ontology instance is created lazily on first document creation).",
    );
  }
  if (options.firstPartyPrefix != null) {
    consola.warn(
      "--first-party-prefix is ignored: first-party deploys now call Backpack directly. Pass the "
        + "Backpack REST base URL via --backpack-api-url instead.",
    );
  }

  const url = options.backpackApiUrl.replace(/\/+$/, "") + "/publish-first-party-document-type";

  // Conjure wire shape for PublishFirstPartyDocumentTypeRequest; the yjs storage union serializes
  // as { type: "yjs", yjs: { schema } }.
  const body = {
    name,
    storage: { type: "yjs", yjs: { schema } },
    fileSystemType,
    ...(owningApplicationId != null ? { owningApplicationId } : {}),
  };

  consola.info("Publishing first-party document type", { name, url });
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${options.auth}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | ConjureErrorBody
      | undefined;
    const errorName = errorBody?.errorName ?? `HTTP ${response.status}`;
    const instance = errorBody?.errorInstanceId != null ? ` [${errorBody.errorInstanceId}]` : "";
    consola.error(`❌ Error during first-party publish: ${errorName}${instance}`);
    throw new CommanderError(1, "ERRFPPUBLISH", errorName);
  }

  const result = (await response.json()) as { name: string };
  consola.success(`Successfully published first-party document type '${result.name}'`);
}
