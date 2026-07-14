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

import { type CreateCommandOptions, createProject } from "@palantir/pack.codegen.core";
import { findUp } from "find-up";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the template reference to an absolute path when it refers to this
 * package's built-in `default` template, otherwise passes it through so the
 * engine can resolve local paths or installed npm packages.
 */
async function resolveTemplate(template?: string): Promise<string> {
  if (!template || template === "default") {
    const packageJsonPath = await findUp("package.json", { cwd: __dirname });
    if (!packageJsonPath) {
      throw new Error("Could not find package.json");
    }
    return path.join(path.dirname(packageJsonPath), "templates/default");
  }
  return template;
}

export async function createCommand(
  projectName: string,
  options: CreateCommandOptions,
): Promise<void> {
  const template = await resolveTemplate(options.template);
  await createProject(projectName, {
    ...options,
    template,
    messaging: { entity: "SDK project" },
  });
}
