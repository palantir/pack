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
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommand, TEMPLATES } from "../commands/create.js";

interface PackageJson {
  readonly name: string;
  readonly scripts?: Record<string, string>;
}

interface PackConfig {
  readonly owningApplicationId?: string;
  readonly documentTypeName?: string;
}

interface TemplateCase {
  readonly label: string;
  readonly template: string;
  readonly projectName: string;
  readonly answers: Record<string, unknown>;
  readonly rootPackageName: string;
  /** Directory (relative to the project) holding the schema package. */
  readonly schemaDir: string;
  readonly firstParty: boolean;
  readonly owningApplicationId?: string;
  readonly expectedFiles: readonly string[];
}

const SCHEMA_FILES = [
  "package.json",
  "pack-config.json",
  "tsconfig.json",
  "README.md",
  ".gitignore",
  "src/schema.mjs",
  "scripts/build-sdk.sh",
];

// The workspace's schema sub-package reuses the single root .gitignore and the root
// README, so it ships neither of those.
const WORKSPACE_SCHEMA_FILES = [
  "package.json",
  "pack-config.json",
  "tsconfig.json",
  "src/schema.mjs",
  "scripts/build-sdk.sh",
];

const WORKSPACE_FILES = [
  "package.json",
  "README.md",
  ".gitignore",
  ...WORKSPACE_SCHEMA_FILES.map(f => `packages/schema/${f}`),
  "packages/sdk/package.json",
  "packages/sdk/src/index.ts",
  "packages/app/package.json",
  "packages/app/src/main.tsx",
  "packages/app/src/App.tsx",
  "packages/app/src/packApp.ts",
];

const CASES: readonly TemplateCase[] = [
  {
    label: "schema (third-party)",
    template: "schema",
    projectName: "my-schema",
    answers: {
      packageName: "@acme/todo.schema",
      sdkPackageName: "@acme/todo.sdk",
      description: "Acme todo",
      documentTypeName: "Acme Todo",
    },
    rootPackageName: "@acme/todo.schema",
    schemaDir: ".",
    firstParty: false,
    expectedFiles: SCHEMA_FILES,
  },
  {
    label: "schema (first-party)",
    template: "schema",
    projectName: "my-fp-schema",
    answers: {
      packageName: "@acme/todo.schema",
      sdkPackageName: "@acme/todo.sdk",
      description: "Acme todo",
      firstParty: true,
      documentTypeName: "com.palantir.pack.todo.task",
      owningApplicationId: "ri.third-party-applications.main.application.abc",
    },
    rootPackageName: "@acme/todo.schema",
    schemaDir: ".",
    firstParty: true,
    owningApplicationId: "ri.third-party-applications.main.application.abc",
    expectedFiles: SCHEMA_FILES,
  },
  {
    label: "workspace (third-party)",
    template: "workspace",
    projectName: "my-workspace",
    answers: {
      scope: "@acme/todo",
      description: "Acme todo",
      documentTypeName: "Acme Todo",
    },
    rootPackageName: "my-workspace",
    schemaDir: "packages/schema",
    firstParty: false,
    expectedFiles: WORKSPACE_FILES,
  },
];

/** All files under `root`, as paths relative to `root`. */
function listFiles(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter(rel => fs.statSync(path.join(root, rel)).isFile());
}

/** Fails if a template placeholder or template asset leaked into the output. */
function assertFullyRendered(root: string, files: readonly string[]): void {
  for (const rel of files) {
    expect(rel.endsWith(".ejs"), `unrendered template file: ${rel}`).toBe(false);
    expect(path.basename(rel), `static _gitignore was not renamed: ${rel}`).not.toBe("_gitignore");

    const contents = fs.readFileSync(path.join(root, rel), "utf8");
    expect(contents.includes("<%"), `unrendered EJS tag in ${rel}`).toBe(false);
  }
}

/** Fails if any generated JSON file does not parse. */
function assertJsonParses(root: string, files: readonly string[]): void {
  for (const rel of files.filter(f => f.endsWith(".json"))) {
    expect(
      () => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")),
      `invalid JSON in ${rel}`,
    ).not.toThrow();
  }
}

/** Fails if any generated TS/TSX/MJS file has a syntax error (no type checking). */
function assertSourcesParse(root: string, files: readonly string[]): void {
  const sources = files.filter(f => /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith(".d.ts"));
  for (const rel of sources) {
    const ext = path.extname(rel);
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      isolatedModules: true,
    };
    if (ext === ".tsx") {
      compilerOptions.jsx = ts.JsxEmit.ReactJSX;
    }
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    const { diagnostics } = ts.transpileModule(source, {
      fileName: path.basename(rel),
      reportDiagnostics: true,
      compilerOptions,
    });
    const errors = (diagnostics ?? [])
      .filter(d => d.category === ts.DiagnosticCategory.Error)
      .map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(errors, `syntax error(s) in ${rel}`).toEqual([]);
  }
}

describe("create-app createCommand", () => {
  let tmpRoot: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pack-create-app-"));
    // Run from inside the temp dir so the project name stays relative, exactly as
    // it would be when a user runs the CLI in their own working directory.
    originalCwd = process.cwd();
    process.chdir(tmpRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Both success and failure paths must avoid killing the test runner.
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.removeSync(tmpRoot);
  });

  it("exposes the built-in templates", () => {
    expect(TEMPLATES.map(t => t.value)).toEqual(["schema", "workspace"]);
  });

  it("exits with an error for an unknown template", async () => {
    await createCommand("bad", {
      template: "does-not-exist",
      skipInstall: true,
      nonInteractive: true,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    "Not Reverse Dns",
    "com.palantir.pack.task", // only one segment after the prefix
    "com.example.pack.a.b", // wrong prefix
  ])("exits with an error for an invalid first-party document type name (%s)", async name => {
    const answersFile = path.join(tmpRoot, "bad-answers.json");
    fs.writeFileSync(
      answersFile,
      JSON.stringify({ firstParty: true, documentTypeName: name }),
    );
    await createCommand("bad-fp", {
      template: "schema",
      config: answersFile,
      skipInstall: true,
      nonInteractive: true,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  for (const testCase of CASES) {
    describe(testCase.label, () => {
      it("generates a fully-rendered, valid project", async () => {
        const projectDir = path.join(tmpRoot, testCase.projectName);
        const answersFile = path.join(tmpRoot, `${testCase.projectName}-answers.json`);
        fs.writeFileSync(answersFile, JSON.stringify(testCase.answers));

        await createCommand(testCase.projectName, {
          template: testCase.template,
          config: answersFile,
          skipInstall: true,
          nonInteractive: true,
        });

        // Generation must have succeeded (no process.exit(1)).
        expect(exitSpy).not.toHaveBeenCalled();

        for (const rel of testCase.expectedFiles) {
          expect(fs.existsSync(path.join(projectDir, rel)), `missing ${rel}`).toBe(true);
        }

        const files = listFiles(projectDir);
        assertFullyRendered(projectDir, files);
        assertJsonParses(projectDir, files);
        assertSourcesParse(projectDir, files);

        const rootPkg = fs.readJSONSync(path.join(projectDir, "package.json")) as PackageJson;
        expect(rootPkg.name).toBe(testCase.rootPackageName);

        // First-party packs build a document type asset; third-party packs deploy.
        const schemaPkg = fs.readJSONSync(
          path.join(projectDir, testCase.schemaDir, "package.json"),
        ) as PackageJson;
        // Every pack can deploy the document type; first-party packs additionally build
        // an asset (and deploy via the first-party endpoint).
        const schemaScripts = schemaPkg.scripts ?? {};
        expect(schemaScripts).toHaveProperty("deploy");
        if (testCase.firstParty) {
          expect(schemaScripts).toHaveProperty("build:asset");
          expect(schemaScripts.deploy).toContain("--first-party");
        } else {
          expect(schemaScripts).not.toHaveProperty("build:asset");
          expect(schemaScripts.deploy).toContain("--parent-folder");
        }

        // owningApplicationId is written into pack-config.json only for first-party packs.
        const packConfig = fs.readJSONSync(
          path.join(projectDir, testCase.schemaDir, "pack-config.json"),
        ) as PackConfig;
        expect(packConfig.owningApplicationId).toBe(testCase.owningApplicationId);
      });
    });
  }
});
