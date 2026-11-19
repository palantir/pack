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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBuilder } from "../core/contextBuilder.js";
import { Generator } from "../core/generator.js";
import { createProject } from "../createProject.js";
import type { TemplateConfig } from "../types/index.js";
import { Logger } from "../utils/logger.js";

// These tests drive the real string-hook child process (no child_process mock), so they
// rely on the built hook runner at build/esm/core/hookRunner.js.
describe("string hooks run in a child process", () => {
  let root: string;
  let templateDir: string;
  let output: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-hook-child-"));
    templateDir = path.join(root, "template-package");
    output = path.join(root, "app");
    fs.ensureDirSync(path.join(templateDir, "template"));
    fs.writeJSONSync(path.join(templateDir, "package.json"), { type: "module" });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("unexpected exit");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it("passes a context too large for argv to the hook over stdin", async () => {
    // >200KB carried in answers. As a single argv string this exceeds Node 26's kill
    // threshold (SIGKILL) and any Node's ARG_MAX; over stdin it arrives intact.
    const blob = "x".repeat(250 * 1024);
    fs.writeFileSync(
      path.join(templateDir, "afterGenerate.mjs"),
      `import fs from "node:fs";
       import path from "node:path";
       export default async function afterGenerate(context, outputPath) {
         fs.writeFileSync(
           path.join(outputPath, "blob-size.txt"),
           String(context.answers.blob.length),
         );
       }`,
    );
    fs.writeFileSync(
      path.join(templateDir, "template.config.js"),
      `export default {
        name: "child-hook-template",
        installDependencies: false,
        hooks: { afterGenerate: "afterGenerate.mjs" },
      };`,
    );

    await createProject(output, { template: templateDir, nonInteractive: true, config: { blob } });

    expect(fs.readFileSync(path.join(output, "blob-size.txt"), "utf8")).toBe(String(blob.length));
  });

  it("applies the context returned by a string beforeGenerate hook", async () => {
    fs.writeFileSync(
      path.join(templateDir, "beforeGenerate.mjs"),
      `export default async function beforeGenerate(context) {
        return { ...context, answers: { ...context.answers, injected: "yes" } };
      }`,
    );
    fs.writeFileSync(
      path.join(templateDir, "template.config.js"),
      `export default {
        name: "before-hook-template",
        installDependencies: false,
        hooks: { beforeGenerate: "beforeGenerate.mjs" },
      };`,
    );
    fs.writeFileSync(
      path.join(templateDir, "template", "result.txt.ejs"),
      "<%= answers.injected %>",
    );

    await createProject(output, { template: templateDir, nonInteractive: true });

    expect(fs.readFileSync(path.join(output, "result.txt"), "utf8")).toBe("yes");
  });

  it("reports the signal when a hook is killed", async () => {
    fs.writeFileSync(
      path.join(templateDir, "killer.mjs"),
      `export default async function afterGenerate() {
        process.kill(process.pid, "SIGKILL");
      }`,
    );
    const templateConfig: TemplateConfig = {
      name: "killer-template",
      installDependencies: false,
      hooks: { afterGenerate: "killer.mjs" },
    };
    const context = new ContextBuilder().build("app", {}, {}, templateConfig, output, {});
    const generator = new Generator(context, templateDir, new Logger());

    await expect(generator.generate()).rejects.toThrow(/killed by signal SIGKILL/);
  });
});
