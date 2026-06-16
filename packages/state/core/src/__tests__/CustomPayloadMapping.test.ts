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

import type {
  DocumentSchema,
  Model,
  UpgradeFns,
  UpgradeRegistry,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import {
  CustomPayloadReadFailureReason,
  parseCustomPayloadSchemaVersion,
  readCustomPayload,
} from "../service/CustomPayloadMapping.js";

interface TestPayload {
  readonly nodeId: string;
  readonly summary: string;
}

function createModel<T>(
  name: string,
  isValid?: (data: unknown) => boolean,
): Model<T> {
  return {
    __type: {} as T,
    [Metadata]: { name },
    zodSchema: isValid == null ? {} : {
      safeParse: (data: unknown) => ({
        success: isValid(data),
      }),
    },
  } as unknown as Model<T>;
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return data != null && typeof data === "object" && !Array.isArray(data);
}

function isTestPayload(data: unknown): boolean {
  return isRecord(data)
    && typeof data.nodeId === "string"
    && typeof data.summary === "string";
}

const TestModel = createModel<TestPayload>("TestModel", isTestPayload);

function createSchema(model: Model = TestModel): DocumentSchema {
  return {
    [Metadata]: {
      version: 1,
    },
    TestModel: model,
  } as const satisfies DocumentSchema;
}

function createLensedSchema(): DocumentSchema {
  const registry: UpgradeRegistry = {
    allFields: {
      nodeId: { type: { kind: "primitive" } },
      summary: { type: { kind: "primitive" } },
    },
    modelName: "TestModel",
    steps: [
      {
        addedInVersion: 2,
        fields: {
          summary: {
            derivedFrom: ["nodeId"],
          },
        },
      },
    ],
  };
  const upgradeFns: UpgradeFns = {
    TestModel: {
      v2: {
        summary: ({ nodeId }: { readonly nodeId: string }) => `Updated ${nodeId}`,
      },
    },
  };

  return {
    [Metadata]: {
      minSupportedVersion: 1,
      upgradeFns,
      upgrades: {
        TestModel: registry,
      },
      version: 2,
    },
    TestModel,
  } as const satisfies DocumentSchema;
}

describe("parseCustomPayloadSchemaVersion", () => {
  it("defaults missing and null schema versions to the legacy version", () => {
    expect(parseCustomPayloadSchemaVersion(undefined)).toBe(1);
    expect(parseCustomPayloadSchemaVersion(null)).toBe(1);
  });

  it("rejects non-positive, non-integer, and non-number schema versions", () => {
    expect(parseCustomPayloadSchemaVersion(0)).toBeUndefined();
    expect(parseCustomPayloadSchemaVersion(1.5)).toBeUndefined();
    expect(parseCustomPayloadSchemaVersion("1")).toBeUndefined();
  });
});

describe("readCustomPayload", () => {
  it("finds a model by metadata name and validates the payload when possible", () => {
    const data = {
      nodeId: "shape-1",
      summary: "Updated shape-1",
    };

    const result = readCustomPayload({
      data,
      docSchema: createSchema(),
      modelName: "TestModel",
      schemaVersion: undefined,
    });

    expect(result).toMatchObject({
      data,
      model: TestModel,
      schemaVersion: 1,
      type: "readable",
    });
  });

  it("applies the read lens before validation", () => {
    const result = readCustomPayload({
      data: {
        nodeId: "shape-1",
      },
      docSchema: createLensedSchema(),
      modelName: "TestModel",
      schemaVersion: 1,
    });

    expect(result).toMatchObject({
      data: {
        nodeId: "shape-1",
        summary: "Updated shape-1",
      },
      schemaVersion: 1,
      type: "readable",
    });
  });

  it("returns unreadable for an invalid schema version", () => {
    const result = readCustomPayload({
      data: {},
      docSchema: createSchema(),
      modelName: "TestModel",
      schemaVersion: "future",
    });

    expect(result).toEqual({
      modelName: "TestModel",
      rawData: {},
      reason: CustomPayloadReadFailureReason.INVALID_SCHEMA_VERSION,
      schemaVersion: undefined,
      type: "unreadable",
    });
  });

  it("returns unreadable for an unsupported schema version", () => {
    const result = readCustomPayload({
      data: {},
      docSchema: createLensedSchema(),
      modelName: "TestModel",
      schemaVersion: 3,
    });

    expect(result).toMatchObject({
      reason: CustomPayloadReadFailureReason.UNSUPPORTED_SCHEMA_VERSION,
      schemaVersion: 3,
      type: "unreadable",
    });
  });

  it("returns unreadable for an unknown model name", () => {
    const result = readCustomPayload({
      data: {},
      docSchema: createSchema(),
      modelName: "UnknownModel",
      schemaVersion: 1,
    });

    expect(result).toMatchObject({
      reason: CustomPayloadReadFailureReason.UNKNOWN_MODEL,
      schemaVersion: 1,
      type: "unreadable",
    });
  });

  it("returns unreadable when a payload cannot be lensed", () => {
    const result = readCustomPayload({
      data: "not an object",
      docSchema: createLensedSchema(),
      modelName: "TestModel",
      schemaVersion: 1,
    });

    expect(result).toMatchObject({
      reason: CustomPayloadReadFailureReason.UNREADABLE_PAYLOAD,
      schemaVersion: 1,
      type: "unreadable",
    });
  });

  it("returns unreadable when validation fails after lensing", () => {
    const result = readCustomPayload({
      data: {
        other: "shape-1",
      },
      docSchema: createLensedSchema(),
      modelName: "TestModel",
      schemaVersion: 1,
    });

    expect(result).toMatchObject({
      reason: CustomPayloadReadFailureReason.INVALID_PAYLOAD,
      schemaVersion: 1,
      type: "unreadable",
    });
  });
});
