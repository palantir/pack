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

/**
 * Regenerates the committed example projects under this directory from the
 * `@palantir/pack.create-app` templates, driven by `template-config.json`.
 *
 * These examples are reference output only: they are excluded from the pnpm
 * workspace (so they are never built, linted, or tested by the monorepo) and
 * are generated with `--skip-install` so no `node_modules` are committed.
 *
 * Build the CLI first (`pnpm turbo run build --filter=@palantir/pack.create-app`),
 * then run: `node generate.mjs`
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(__dirname, "../create-app-cli/bin/cli-node.js");
const config = JSON.parse(
  readFileSync(path.join(__dirname, "template-config.json"), "utf8"),
);

for (const example of config.examples) {
  const tmp = mkdtempSync(path.join(tmpdir(), "pack-example-"));
  const answersFile = path.join(tmp, "answers.json");
  writeFileSync(answersFile, JSON.stringify(example.answers ?? {}));

  console.log(`\nGenerating example "${example.name}" (template: ${example.template})`);
  execFileSync(
    "node",
    [
      cli,
      example.name,
      "--template",
      example.template,
      "--config",
      answersFile,
      "--non-interactive",
      "--skip-install",
      "--overwrite",
    ],
    { cwd: __dirname, stdio: "inherit" },
  );

  rmSync(tmp, { recursive: true, force: true });
}

console.log("\nDone. Example projects regenerated.");
