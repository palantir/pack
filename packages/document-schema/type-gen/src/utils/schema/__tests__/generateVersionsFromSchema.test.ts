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

import type { SchemaBuilder } from "@palantir/pack.schema";
import { defineRecord, defineSchema, defineSchemaUpdate, nextSchema } from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import { generateVersionsFromSchema } from "../generateVersionsFromSchema.js";

describe("generateVersionsFromSchema", () => {
  it("should generate version types for a single-version schema", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: { name: P.String },
      }),
    });

    const result = generateVersionsFromSchema(schemaV1);

    expect(result).toContain("export type SupportedVersions = 1;");
    expect(result).toContain("export type LatestVersion = 1;");
    expect(result).toContain("export type MinSupportedVersion = 1;");
  });

  it("should generate version types for a multi-version schema", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: { name: P.String },
      }),
    });

    const addDescription = defineSchemaUpdate(
      "addDescription",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Item: schema.Item.addField("description", P.Optional(P.String)).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addDescription).build();

    const result = generateVersionsFromSchema(schemaV2, 1);

    expect(result).toContain("export type SupportedVersions = 1 | 2;");
    expect(result).toContain("export type LatestVersion = 2;");
    expect(result).toContain("export type MinSupportedVersion = 1;");
  });

  it("should respect minSupportedVersion", () => {
    const schemaV1 = defineSchema({
      Item: defineRecord("Item", {
        docs: "",
        fields: { name: P.String },
      }),
    });

    const addDescription = defineSchemaUpdate(
      "addDescription",
      (schema: SchemaBuilder<typeof schemaV1.models>) => ({
        Item: schema.Item.addField("description", P.Optional(P.String)).build(),
      }),
    );

    const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(addDescription).build();

    // Default (no minVersion): latest only
    const resultDefault = generateVersionsFromSchema(schemaV2);
    expect(resultDefault).toContain("export type SupportedVersions = 2;");
    expect(resultDefault).toContain("export type LatestVersion = 2;");
    expect(resultDefault).toContain("export type MinSupportedVersion = 2;");

    // Explicit minVersion = 1
    const resultWithV1 = generateVersionsFromSchema(schemaV2, 1);
    expect(resultWithV1).toContain("export type SupportedVersions = 1 | 2;");
    expect(resultWithV1).toContain("export type MinSupportedVersion = 1;");
  });
});
