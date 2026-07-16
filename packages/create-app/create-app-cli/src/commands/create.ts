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

import { createProject, Logger, promptUser } from "@palantir/pack.codegen.core";
import { findUp } from "find-up";
import { readFile } from "node:fs/promises";
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
  readonly firstParty?: boolean;
  readonly owningApplicationId?: string;
  readonly skipInstall?: boolean;
  readonly verbose?: boolean;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly config?: string;
  readonly overwrite?: boolean;
}

const DEFAULT_PROJECT_NAME = "my-pack-app";
const DEFAULT_TEMPLATE: TemplateName = "workspace";

/** First-party document types must be named as a `com.palantir.pack.*` reverse-DNS identifier. */
const FIRST_PARTY_DOC_TYPE_PATTERN = /^com\.palantir\.pack\.[a-z0-9]+(?:\.[a-z0-9]+)*$/;
const FIRST_PARTY_DOC_TYPE_HINT =
  "first-party document type names must look like com.palantir.pack.<name> (lowercase, dot-separated)";

function defaultDocumentTypeName(firstParty: boolean): string {
  return firstParty ? "com.palantir.pack.example.document" : "My Document Type";
}

async function resolveTemplateDir(template: TemplateName): Promise<string> {
  const packageJsonPath = await findUp("package.json", { cwd: __dirname });
  if (!packageJsonPath) {
    throw new Error("Could not locate the create-app package root");
  }
  return path.join(path.dirname(packageJsonPath), "templates", template);
}

function nextSteps(template: TemplateName, firstParty: boolean) {
  return ({ projectName, skipInstall }: { projectName: string; skipInstall?: boolean }) => {
    const steps = [`cd ${projectName}`];
    if (skipInstall) {
      steps.push("npm install");
    }
    if (template === "workspace") {
      steps.push("npm run sdk-gen    # generate the SDK from packages/schema");
      steps.push("npm run build:sdk  # compile the generated SDK");
      steps.push("npm run dev        # start the example app");
    } else if (firstParty) {
      steps.push("npm run build:asset   # build the document type asset for your app");
    } else {
      steps.push(
        "npm run deploy   # deploy the document type (set FOUNDRY_URL, FOUNDRY_TOKEN, PARENT_FOLDER_RID)",
      );
    }
    return steps;
  };
}

async function loadConfigAnswers(configPath: string | undefined): Promise<Record<string, unknown>> {
  if (!configPath) {
    return {};
  }
  const contents = await readFile(path.resolve(configPath), "utf-8");
  return JSON.parse(contents) as Record<string, unknown>;
}

async function resolveFirstParty(
  options: CreateAppOptions,
  configAnswers: Record<string, unknown>,
  nonInteractive: boolean,
): Promise<boolean> {
  if (options.firstParty != null) {
    return options.firstParty;
  }
  if (typeof configAnswers.firstParty === "boolean") {
    return configAnswers.firstParty;
  }
  if (nonInteractive) {
    return false;
  }
  const answers = await promptUser([{
    type: "confirm",
    name: "firstParty",
    message: "Is this a first-party pack?",
    default: false,
  }]);
  return answers.firstParty === true;
}

async function resolveDocumentTypeName(
  configAnswers: Record<string, unknown>,
  firstParty: boolean,
  nonInteractive: boolean,
): Promise<string> {
  const provided = configAnswers.documentTypeName;
  if (typeof provided === "string" && provided.length > 0) {
    if (firstParty && !FIRST_PARTY_DOC_TYPE_PATTERN.test(provided)) {
      throw new Error(`Invalid documentTypeName "${provided}": ${FIRST_PARTY_DOC_TYPE_HINT}`);
    }
    return provided;
  }
  if (nonInteractive) {
    return defaultDocumentTypeName(firstParty);
  }
  const answers = await promptUser([{
    type: "input",
    name: "documentTypeName",
    message: firstParty ? "Document type name (com.palantir.pack.*)?" : "Document type name?",
    default: defaultDocumentTypeName(firstParty),
    validate: firstParty
      ? (input: unknown) =>
        FIRST_PARTY_DOC_TYPE_PATTERN.test(String(input)) || FIRST_PARTY_DOC_TYPE_HINT
      : undefined,
  }]);
  return String(answers.documentTypeName);
}

async function resolveOwningApplicationId(
  options: CreateAppOptions,
  configAnswers: Record<string, unknown>,
  nonInteractive: boolean,
): Promise<string | undefined> {
  const provided = options.owningApplicationId
    ?? (typeof configAnswers.owningApplicationId === "string"
      ? configAnswers.owningApplicationId
      : undefined);
  if (provided != null) {
    return provided.length > 0 ? provided : undefined;
  }
  if (nonInteractive) {
    return undefined;
  }
  const answers = await promptUser([{
    type: "input",
    name: "owningApplicationId",
    message: "Owning application id (optional, press enter to skip)?",
    default: "",
  }]);
  const value = String(answers.owningApplicationId).trim();
  return value.length > 0 ? value : undefined;
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

    // Resolve first-party vs third-party inputs. First-party packs build a document
    // type asset (and may declare an owning application); third-party packs deploy the
    // document type to a Foundry stack.
    const configAnswers = await loadConfigAnswers(options.config);
    const firstParty = await resolveFirstParty(options, configAnswers, nonInteractive);
    const documentTypeName = await resolveDocumentTypeName(
      configAnswers,
      firstParty,
      nonInteractive,
    );
    const owningApplicationId = firstParty
      ? await resolveOwningApplicationId(options, configAnswers, nonInteractive)
      : undefined;

    const answers: Record<string, unknown> = {
      ...configAnswers,
      firstParty,
      documentTypeName,
    };
    if (owningApplicationId != null) {
      answers.owningApplicationId = owningApplicationId;
    } else {
      delete answers.owningApplicationId;
    }

    const templateDir = await resolveTemplateDir(selected.value);

    await createProject(project, {
      template: templateDir,
      config: answers,
      skipInstall: options.skipInstall,
      verbose: options.verbose,
      dryRun: options.dryRun,
      nonInteractive: options.nonInteractive,
      overwrite: options.overwrite,
      messaging: {
        entity: selected.entity,
        nextSteps: nextSteps(selected.value, firstParty),
      },
    });
  } catch (error) {
    logger.error(
      `Failed to scaffold project: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
