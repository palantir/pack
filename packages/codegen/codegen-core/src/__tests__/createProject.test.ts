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

import { spawnSync } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../createProject.js";

vi.mock("child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

describe("custom templates", () => {
  let root: string;
  let templateDir: string;
  let output: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-custom-template-"));
    templateDir = path.join(root, "template-package");
    output = path.join(root, "app");
    fs.ensureDirSync(path.join(templateDir, "template"));
    fs.writeJSONSync(path.join(templateDir, "package.json"), { type: "module" });
    fs.writeFileSync(
      path.join(templateDir, "template.config.js"),
      `
      import fs from "node:fs/promises";
      export default {
        name: "repo-template",
        installDependencies: false,
        nextSteps: context => ["Build " + context.answers.packageName],
        hooks: {
          beforeGenerate: async context => {
            if (!context.options.dryRun) {
              await fs.mkdir(context.outputPath);
              await fs.writeFile(context.outputPath + "/package.json", '{"name":"example-app"}');
            }
            return { ...context, answers: { ...context.answers, packageName: "example-app" } };
          },
        },
      };
    `,
    );
    fs.writeFileSync(
      path.join(templateDir, "template", "result.txt.ejs"),
      "<%= answers.packageName %>",
    );
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("unexpected exit");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fs.removeSync(root);
  });

  it("lets a template create the package before adding files and skip npm install", async () => {
    await createProject(output, { template: templateDir, nonInteractive: true });

    expect(fs.readFileSync(path.join(output, "result.txt"), "utf8")).toBe("example-app");
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("does not create an output directory when the template rejects the inputs", async () => {
    fs.writeFileSync(
      path.join(templateDir, "template.config.js"),
      `
      export default {
        name: "invalid-input",
        hooks: { beforeGenerate: async () => { throw new Error("Package already exists"); } },
      };
    `,
    );
    await expect(
      createProject(output, { template: templateDir, nonInteractive: true }),
    ).rejects.toThrow("unexpected exit");

    expect(fs.existsSync(output)).toBe(false);
  });

  it("lets a template preview creation without writing files or installing dependencies", async () => {
    await createProject(output, { template: templateDir, nonInteractive: true, dryRun: true });

    expect(fs.existsSync(output)).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
