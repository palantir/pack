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

import { createProject, Logger, promptUser } from "@palantir/pack.codegen.core";
import { findUp } from "find-up";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATES = [
  {
    value: "schema",
    name: "schema — a standalone PACK schema package for an existing workspace",
    entity: "PACK schema package",
  },
  {
    value: "workspace",
    name: "workspace — a schema + sdk + app npm-workspace starter project",
    entity: "PACK workspace",
  },
] as const;

type TemplateName = (typeof TEMPLATES)[number]["value"];

export interface CreateAppOptions {
  readonly template?: string;
  readonly skipInstall?: boolean;
  readonly verbose?: boolean;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly config?: string;
  readonly overwrite?: boolean;
}

const DEFAULT_PROJECT_NAME = "my-pack-app";
const DEFAULT_TEMPLATE: TemplateName = "workspace";

async function resolveTemplateDir(template: TemplateName): Promise<string> {
  const packageJsonPath = await findUp("package.json", { cwd: __dirname });
  if (!packageJsonPath) {
    throw new Error("Could not locate the create-app package root");
  }
  return path.join(path.dirname(packageJsonPath), "templates", template);
}

function nextSteps(template: TemplateName) {
  return ({ projectName, skipInstall }: { projectName: string; skipInstall?: boolean }) => {
    const steps = [`cd ${projectName}`];
    if (skipInstall) {
      steps.push("npm install");
    }
    if (template === "workspace") {
      steps.push("npm run sdk-gen   # generate the SDK from packages/schema");
      steps.push("npm run dev       # start the example app");
    } else {
      steps.push("npm run build:asset   # compile the schema to an IR + asset");
    }
    return steps;
  };
}

export async function createCommand(
  projectName: string | undefined,
  options: CreateAppOptions,
): Promise<void> {
  const logger = new Logger(options.verbose);
  const nonInteractive = Boolean(options.nonInteractive) || Boolean(process.env.CI);

  try {
    // Resolve the target directory name
    let project = projectName;
    if (!project) {
      if (nonInteractive) {
        project = DEFAULT_PROJECT_NAME;
      } else {
        const answers = await promptUser([{
          type: "input",
          name: "projectName",
          message: "Project directory?",
          default: DEFAULT_PROJECT_NAME,
        }]);
        project = String(answers.projectName);
      }
    }

    // Resolve which template to use
    let template = options.template;
    if (!template) {
      if (nonInteractive) {
        template = DEFAULT_TEMPLATE;
      } else {
        const answers = await promptUser([{
          type: "list",
          name: "template",
          message: "Which template would you like?",
          choices: TEMPLATES.map(t => ({ name: t.name, value: t.value })),
        }]);
        template = String(answers.template);
      }
    }

    const selected = TEMPLATES.find(t => t.value === template);
    if (!selected) {
      throw new Error(
        `Unknown template "${template}". Valid templates: ${
          TEMPLATES.map(t => t.value).join(", ")
        }`,
      );
    }

    const templateDir = await resolveTemplateDir(selected.value);

    await createProject(project, {
      template: templateDir,
      skipInstall: options.skipInstall,
      verbose: options.verbose,
      dryRun: options.dryRun,
      nonInteractive: options.nonInteractive,
      config: options.config,
      overwrite: options.overwrite,
      messaging: {
        entity: selected.entity,
        nextSteps: nextSteps(selected.value),
      },
    });
  } catch (error) {
    logger.error(
      `Failed to scaffold project: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
