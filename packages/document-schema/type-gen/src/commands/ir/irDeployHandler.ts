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
import type { ConjureDocumentTypeSchema } from "../../utils/ir/convertIrToConjureSchema.js";
import { convertIrToConjureSchema } from "../../utils/ir/convertIrToConjureSchema.js";
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
  /** Deprecated/ignored; first-party deploys call the first-party API directly (use firstPartyApiUrl). Kept so existing invocations don't fail. */
  readonly firstPartyPrefix?: string;
  /**
   * First-party document type REST API base URL, REQUIRED for first-party deploys. The context path
   * is installation-dependent, so pass the value for your stack.
   */
  readonly firstPartyApiUrl?: string;
}

export async function irDeployHandler(options: DeployOptions): Promise<void> {
  try {
    const irPath = resolve(options.ir);
    consola.info(`Reading schema from: ${irPath}`);

    const { ir, owningApplicationId } = resolveIrInput(
      JSON.parse(readFileSync(irPath, "utf8")) as unknown,
      irPath,
    );
    const fileSystemType = options.fileSystemType ?? "ARTIFACTS";

    if (options.firstParty) {
      // The first-party publish endpoint expects the nested-union Conjure shape, not the flat OSDK shape.
      await deployFirstParty(
        options,
        ir.name,
        convertIrToConjureSchema(ir),
        fileSystemType,
        owningApplicationId,
      );
    } else {
      await deployThirdParty(options, ir.name, convertIrToWireSchema(ir), fileSystemType);
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

/** Subset of the Conjure error body that we surface to the user. */
interface ConjureErrorBody {
  readonly errorName?: string;
  readonly errorInstanceId?: string;
}

/**
 * Publishes a global, name-keyed first-party document type in DEV MODE, via the internal-only
 * `publishFirstPartyDocumentType` endpoint (a direct authenticated PUT to the first-party Conjure
 * REST API — this is not part of the public Foundry API / OSDK, and its generated client lives in
 * an internal registry this public package cannot depend on).
 *
 * Dev-mode semantics: the schema is recorded unversioned at the dev sentinel (version -1), no RID
 * is minted, and the per-ontology instance is created lazily on first document creation. Re-running
 * with the SAME document type name overwrites the definition, so you can iterate on the schema
 * freely — there is no version bump or backwards-compatibility check until the type graduates to a
 * real version via an asset deploy.
 *
 * Note: a name that already exists as an old-world RID-keyed (non-dev) type is rejected until the
 * one-time backfill migrates it into the asset store; brand-new names publish immediately.
 */
async function deployFirstParty(
  options: DeployOptions,
  name: string,
  schema: ConjureDocumentTypeSchema,
  fileSystemType: FileSystemType,
  owningApplicationId: string | undefined,
): Promise<void> {
  if (options.firstPartyApiUrl == null || options.firstPartyApiUrl.length === 0) {
    throw new CommanderError(
      1,
      "EINVAL",
      "--first-party-api-url is required for first-party deploys. Pass your stack's first-party "
        + "document type REST API base URL.",
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
      "--first-party-prefix is ignored: first-party deploys now call the first-party API directly. "
        + "Pass its base URL via --first-party-api-url instead.",
    );
  }

  const url = options.firstPartyApiUrl.replace(/\/+$/, "") + "/publish-first-party-document-type";

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
