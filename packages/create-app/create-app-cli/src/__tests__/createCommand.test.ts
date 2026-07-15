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
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommand, TEMPLATES } from "../commands/create.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testOutputDir = path.join(__dirname, "../../test-output", "create-command");

describe("create-app createCommand", () => {
  beforeAll(async () => {
    await fs.remove(testOutputDir);
    await fs.ensureDir(testOutputDir);
  });

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the built-in templates", () => {
    expect(TEMPLATES.map(t => t.value)).toEqual(["schema", "workspace"]);
  });

  it("scaffolds the schema template", async () => {
    const projectName = "schema-app";
    const outputPath = path.join(testOutputDir, projectName);
    const originalCwd = process.cwd();
    process.chdir(testOutputDir);

    try {
      await createCommand(projectName, {
        template: "schema",
        skipInstall: true,
        nonInteractive: true,
      });

      expect(await fs.pathExists(path.join(outputPath, "package.json"))).toBe(true);
      expect(await fs.pathExists(path.join(outputPath, "pack-config.json"))).toBe(true);
      expect(await fs.pathExists(path.join(outputPath, "src", "schema.mjs"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("scaffolds the workspace template", async () => {
    const projectName = "workspace-app";
    const outputPath = path.join(testOutputDir, projectName);
    const originalCwd = process.cwd();
    process.chdir(testOutputDir);

    try {
      await createCommand(projectName, {
        template: "workspace",
        skipInstall: true,
        nonInteractive: true,
      });

      expect(await fs.pathExists(path.join(outputPath, "packages", "schema", "package.json")))
        .toBe(true);
      expect(await fs.pathExists(path.join(outputPath, "packages", "sdk", "src", "index.ts")))
        .toBe(true);
      expect(await fs.pathExists(path.join(outputPath, "packages", "app", "package.json")))
        .toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("exits with an error for an unknown template", async () => {
    await createCommand("bad-template-app", {
      template: "does-not-exist",
      skipInstall: true,
      nonInteractive: true,
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.mocked returns safe mock
    expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
  });
});
