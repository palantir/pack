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
import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

interface HookContext {
  outputPath: string;
  schema: unknown;
  schemaPath?: string;
  answers?: Readonly<Record<string, unknown>>;
  options: { dryRun?: boolean; skipInstall?: boolean };
}

function resolveTypeGenCli(): { cli: string; packageJsonPath: string } {
  const resolvedUrl = import.meta.resolve(
    "@palantir/pack.document-schema.type-gen",
  );
  const cli = path.resolve(
    fileURLToPath(resolvedUrl),
    "../../../bin/cli-node.js",
  );
  const packageJsonPath = path.resolve(
    fileURLToPath(resolvedUrl),
    "../../../package.json",
  );
  return { cli, packageJsonPath };
}

async function syncModelTypesVersion(
  outputPath: string,
  typeGenPackageJsonPath: string,
): Promise<void> {
  const typeGenPackageJson = await fs.readJson(typeGenPackageJsonPath) as {
    dependencies?: Record<string, string>;
  };
  const modelTypesVersion = typeGenPackageJson.dependencies?.[
    "@palantir/pack.document-schema.model-types"
  ];
  if (modelTypesVersion == null) {
    consola.warn("Could not find model-types dependency in type-gen package.json");
    return;
  }

  const outputPackageJsonPath = path.join(outputPath, "package.json");
  const outputPackageJson = await fs.readJson(outputPackageJsonPath) as {
    dependencies?: Record<string, string>;
  };
  if (outputPackageJson.dependencies?.["@palantir/pack.document-schema.model-types"] != null) {
    outputPackageJson.dependencies["@palantir/pack.document-schema.model-types"] =
      modelTypesVersion;
    await fs.writeJson(outputPackageJsonPath, outputPackageJson, { spaces: 2 });
    consola.log(`Updated model-types dependency to ${modelTypesVersion}`);
  }
}

function readMinVersion(
  answers: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  const raw = answers?.minVersion;
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw new Error(`minVersion answer must be a number or numeric string`);
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`minVersion answer must be an integer, got: ${raw}`);
  }
  return value;
}

export default async function afterGenerate(context: HookContext): Promise<void> {
  const { outputPath, schemaPath, answers, options } = context;

  if (options.dryRun) return;
  if (schemaPath == null) {
    consola.warn("No --schema provided; skipping versioned SDK generation");
    return;
  }

  const resolvedSchema = path.resolve(schemaPath);
  const { cli: typeGenCli, packageJsonPath: typeGenPackageJsonPath } = resolveTypeGenCli();

  const irPath = path.join(outputPath, "build", "ir.json");
  await fs.ensureDir(path.dirname(irPath));

  consola.log("Resolving schema to versioned IR...");
  const irResult = spawnSync(
    typeGenCli,
    ["schema", "ir", "-i", resolvedSchema, "-o", irPath],
    { stdio: "inherit", cwd: outputPath },
  );
  if (irResult.status !== 0) {
    throw new Error(
      `'schema ir' failed with exit code ${irResult.status ?? "unknown"}`,
    );
  }

  const minVersion = readMinVersion(answers);

  consola.log("Generating versioned SDK files from IR...");
  const genArgs = [
    "ir",
    "gen-types",
    "-s",
    irPath,
    "-o",
    path.join(outputPath, "src"),
  ];
  if (minVersion != null) {
    genArgs.push("--min-version", String(minVersion));
  }
  const genResult = spawnSync(typeGenCli, genArgs, { stdio: "inherit", cwd: outputPath });
  if (genResult.status !== 0) {
    throw new Error(
      `'ir gen-types' failed with exit code ${genResult.status ?? "unknown"}`,
    );
  }

  await syncModelTypesVersion(outputPath, typeGenPackageJsonPath);

  consola.log("Versioned SDK generation complete.");
}
