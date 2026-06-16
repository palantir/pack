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

import type { DocumentSchema, Model, ModelData } from "@palantir/pack.document-schema.model-types";
import { getMetadata, hasMetadata } from "@palantir/pack.document-schema.model-types";
import { resolveAndApplyLens } from "../upgrade/UpgradeLens.js";

export const LEGACY_CUSTOM_PAYLOAD_SCHEMA_VERSION: 1 = 1;

export type CustomPayloadReadFailureReason =
  | "invalidSchemaVersion"
  | "unsupportedSchemaVersion"
  | "unknownModel"
  | "unreadablePayload"
  | "invalidPayload";

export const CustomPayloadReadFailureReason: Readonly<{
  INVALID_PAYLOAD: "invalidPayload";
  INVALID_SCHEMA_VERSION: "invalidSchemaVersion";
  UNKNOWN_MODEL: "unknownModel";
  UNREADABLE_PAYLOAD: "unreadablePayload";
  UNSUPPORTED_SCHEMA_VERSION: "unsupportedSchemaVersion";
}> = {
  INVALID_PAYLOAD: "invalidPayload",
  INVALID_SCHEMA_VERSION: "invalidSchemaVersion",
  UNKNOWN_MODEL: "unknownModel",
  UNREADABLE_PAYLOAD: "unreadablePayload",
  UNSUPPORTED_SCHEMA_VERSION: "unsupportedSchemaVersion",
};

export interface ReadCustomPayloadOptions {
  readonly data: unknown;
  readonly docSchema: DocumentSchema;
  readonly modelName: string;
  readonly schemaVersion?: unknown;
}

export interface ReadableCustomPayload {
  readonly data: ModelData<Model>;
  readonly model: Model;
  readonly schemaVersion: number;
  readonly type: "readable";
}

export interface UnreadableCustomPayload {
  readonly modelName: string;
  readonly rawData: unknown;
  readonly reason: CustomPayloadReadFailureReason;
  readonly schemaVersion?: number;
  readonly type: "unreadable";
}

export type ReadCustomPayloadResult =
  | ReadableCustomPayload
  | UnreadableCustomPayload;

export function parseCustomPayloadSchemaVersion(schemaVersion: unknown): number | undefined {
  if (schemaVersion == null) {
    return LEGACY_CUSTOM_PAYLOAD_SCHEMA_VERSION;
  }

  return typeof schemaVersion === "number"
      && Number.isInteger(schemaVersion)
      && schemaVersion > 0
    ? schemaVersion
    : undefined;
}

export function readCustomPayload({
  data,
  docSchema,
  modelName,
  schemaVersion,
}: ReadCustomPayloadOptions): ReadCustomPayloadResult {
  const parsedSchemaVersion = parseCustomPayloadSchemaVersion(schemaVersion);
  if (parsedSchemaVersion == null) {
    return unreadable(
      modelName,
      data,
      CustomPayloadReadFailureReason.INVALID_SCHEMA_VERSION,
    );
  }

  if (!isSupportedSchemaVersion(docSchema, parsedSchemaVersion)) {
    return unreadable(
      modelName,
      data,
      CustomPayloadReadFailureReason.UNSUPPORTED_SCHEMA_VERSION,
      parsedSchemaVersion,
    );
  }

  const model = getModelByName(docSchema, modelName);
  if (model == null) {
    return unreadable(
      modelName,
      data,
      CustomPayloadReadFailureReason.UNKNOWN_MODEL,
      parsedSchemaVersion,
    );
  }

  const lensResult = applyReadLensIfNeeded(docSchema, modelName, data);
  if (lensResult.type === "unreadable") {
    return unreadable(
      modelName,
      data,
      CustomPayloadReadFailureReason.UNREADABLE_PAYLOAD,
      parsedSchemaVersion,
    );
  }

  if (!isValidModelData(model, lensResult.data)) {
    return unreadable(
      modelName,
      data,
      CustomPayloadReadFailureReason.INVALID_PAYLOAD,
      parsedSchemaVersion,
    );
  }

  return {
    data: lensResult.data as ModelData<Model>,
    model,
    schemaVersion: parsedSchemaVersion,
    type: "readable",
  };
}

function unreadable(
  modelName: string,
  rawData: unknown,
  reason: CustomPayloadReadFailureReason,
  schemaVersion?: number,
): UnreadableCustomPayload {
  return {
    modelName,
    rawData,
    reason,
    schemaVersion,
    type: "unreadable",
  };
}

function isSupportedSchemaVersion(docSchema: DocumentSchema, schemaVersion: number): boolean {
  const schemaMetadata = getMetadata(docSchema);
  const minSupportedVersion = schemaMetadata.minSupportedVersion ?? schemaMetadata.version;
  return schemaVersion >= minSupportedVersion && schemaVersion <= schemaMetadata.version;
}

function getModelByName(docSchema: DocumentSchema, modelName: string): Model | undefined {
  for (const candidate of Object.values(docSchema)) {
    if (candidate != null && typeof candidate === "object" && hasMetadata(candidate)) {
      const metadata = getMetadata(candidate);
      if (isNamedMetadata(metadata) && metadata.name === modelName) {
        return candidate as Model;
      }
    }
  }
  return undefined;
}

function isNamedMetadata(metadata: unknown): metadata is { readonly name: string } {
  return metadata != null
    && typeof metadata === "object"
    && "name" in metadata
    && typeof metadata.name === "string";
}

function applyReadLensIfNeeded(
  docSchema: DocumentSchema,
  modelName: string,
  data: unknown,
): ApplyReadLensResult {
  const schemaMetadata = getMetadata(docSchema);
  const upgradeEntry = schemaMetadata.upgrades?.[modelName];
  if (upgradeEntry == null) {
    return {
      data,
      type: "readable",
    };
  }

  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return {
      type: "unreadable",
    };
  }

  try {
    return {
      data: resolveAndApplyLens(
        data as Record<string, unknown>,
        upgradeEntry,
        schemaMetadata.upgrades ?? {},
        schemaMetadata.upgradeFns,
      ),
      type: "readable",
    };
  } catch {
    return {
      type: "unreadable",
    };
  }
}

type ApplyReadLensResult =
  | {
    readonly data: unknown;
    readonly type: "readable";
  }
  | {
    readonly type: "unreadable";
  };

function isValidModelData(model: Model, data: unknown): boolean {
  const zodSchema = model.zodSchema as {
    readonly safeParse?: (data: unknown) => { readonly success: boolean };
  };
  const safeParse = zodSchema.safeParse;
  if (safeParse == null) {
    return true;
  }

  return safeParse.call(model.zodSchema, data).success;
}
