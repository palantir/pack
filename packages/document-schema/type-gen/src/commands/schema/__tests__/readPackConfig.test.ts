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

import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPackConfig } from "../schemaIrHandler.js";

describe("readPackConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-config-"));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  async function writeConfig(config: unknown): Promise<string> {
    const configPath = path.join(tmpDir, "pack-config.json");
    await fs.writeJson(configPath, config);
    return configPath;
  }

  it("reads a valid config", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: 1,
    });
    await expect(readPackConfig(configPath)).resolves.toEqual({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: 1,
      owningApplicationId: undefined,
    });
  });

  it("reads a valid config with minSupportedVersion omitted", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
    });
    await expect(readPackConfig(configPath)).resolves.toEqual({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: undefined,
      owningApplicationId: undefined,
    });
  });

  it("reads owningApplicationId when present", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      owningApplicationId: "app-123",
    });
    await expect(readPackConfig(configPath)).resolves.toEqual({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: undefined,
      owningApplicationId: "app-123",
    });
  });

  it("throws when owningApplicationId is an empty string", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      owningApplicationId: "   ",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'owningApplicationId' in",
    );
  });

  it("throws when the config file does not exist", async () => {
    const configPath = path.join(tmpDir, "missing.json");
    await expect(readPackConfig(configPath)).rejects.toThrow(
      `--config file not found: ${configPath}`,
    );
  });

  it("throws when documentTypeName is missing", async () => {
    const configPath = await writeConfig({
      documentTypeDescription: "Document type description for demo canvas",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'documentTypeName' is required",
    );
  });

  it("throws when documentTypeName is an empty string", async () => {
    const configPath = await writeConfig({
      documentTypeName: "   ",
      documentTypeDescription: "Document type description for demo canvas",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'documentTypeName' in",
    );
  });

  it("throws when documentTypeName is not a string", async () => {
    const configPath = await writeConfig({
      documentTypeName: 42,
      documentTypeDescription: "Document type description for demo canvas",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'documentTypeName' in",
    );
  });

  it("throws when documentTypeDescription is missing", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'documentTypeDescription' is required",
    );
  });

  it("throws when documentTypeDescription is an empty string", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "",
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'documentTypeDescription' in",
    );
  });

  it("throws when minSupportedVersion is not a positive integer", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: 0,
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'minSupportedVersion' in",
    );
  });

  it("throws when minSupportedVersion is not an integer", async () => {
    const configPath = await writeConfig({
      documentTypeName: "Canvas Document Type",
      documentTypeDescription: "Document type description for demo canvas",
      minSupportedVersion: 1.5,
    });
    await expect(readPackConfig(configPath)).rejects.toThrow(
      "'minSupportedVersion' in",
    );
  });
});
