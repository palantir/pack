#!/usr/bin/env node
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

// Writes the generated platform SDK (the Pack API client that npm @osdk/foundry.pack provides) into
// @palantir/pack.core, which exposes it as "@palantir/pack.core/generatedPlatformSdk". This lets PACK
// use new api-gateway endpoints before @osdk/foundry.pack is published.
//
// Usage: MAVEN_DIST_RELEASE=<artifactory url> pnpm platform-sdk:generate \
//   --api-gateway-version <version> --gotham-objects-gateway-version <version>
//
// The api-gateway version becomes the minimum api-gateway version of every package that uses the
// SDK, so pick the oldest version that has the endpoints PACK needs.
//
// Gotham stacks serve the Pack API through gotham-objects-gateway, which bundles api-gateway. Pass the
// first gotham-objects-gateway release that includes that api-gateway version (look for an "Upgrade
// api-gateway to <version>" commit). It is an optional dependency, so it only applies on stacks that
// run gotham-objects-gateway.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SDK_DIR = path.join(REPO_DIR, "packages/core/src/generated/platformSdk");
// The packages that use the SDK. Each declares the minimum backend versions in its "sls" block, as
// the npm @osdk/foundry.pack dependency used to do for them.
const PACKAGES_USING_SDK = [
  "packages/state/foundry",
  "packages/state/foundry-event",
  "packages/document-schema/type-gen",
];
const IR_DIR = path.join(REPO_DIR, "tmp/api-gateway-ir");
const OUTPUT_DIR = path.join(REPO_DIR, "tmp/platformSdk");

const apiGatewayVersion = readArg("--api-gateway-version");
const gothamObjectsGatewayVersion = readArg("--gotham-objects-gateway-version");
if (apiGatewayVersion == null || gothamObjectsGatewayVersion == null) {
  console.error(
    "Usage: pnpm platform-sdk:generate --api-gateway-version <version> --gotham-objects-gateway-version <version>",
  );
  process.exit(1);
}

// 1. Download api-gateway's description of its APIs (the IR), and generate the Pack API plus the APIs
//    it uses (foundry.core, foundry.filesystem). The generator also writes the api-gateway minimum
//    into the first package's "sls" block.
const firstPackageJson = path.join(REPO_DIR, PACKAGES_USING_SDK[0], "package.json");
run("bash", [
  "scripts/getOpenApiIr.sh",
  "--api-gateway-version",
  apiGatewayVersion,
  "--outDir",
  IR_DIR,
]);
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
run("pnpm", [
  "exec",
  "platform-sdk-generator",
  "generate-external",
  "--namespace",
  "Pack",
  "--irDir",
  IR_DIR,
  "--outputDir",
  OUTPUT_DIR,
  "--slsPackageJson",
  firstPackageJson,
]);

// 2. The generated folders import each other by npm package name (e.g. "@osdk/foundry.core/v2"),
//    and those names only resolve through the generator's tsconfig.paths.json. Rewrite them as
//    relative paths, so the code and the type files PACK publishes work without it.
rewriteNamespaceImports(OUTPUT_DIR);
for (const file of listFiles(OUTPUT_DIR)) {
  if (path.basename(file) === "package.json") {
    fs.rmSync(file); // the generator writes one per folder; PACK doesn't use them
  }
}

// 3. Replace the SDK in @palantir/pack.core, and set the api-gateway and gotham-objects-gateway
//    minimums in every package that uses the SDK. Other "sls" entries are left as they are.
fs.rmSync(SDK_DIR, { recursive: true, force: true });
fs.cpSync(OUTPUT_DIR, SDK_DIR, { recursive: true });
const apiGatewayKey = "com.palantir.foundry.api:api-gateway";
const minimums = {
  [apiGatewayKey]: readJson(firstPackageJson).sls.dependencies[apiGatewayKey],
  "com.palantir.gotham:gotham-objects-gateway": {
    minVersion: gothamObjectsGatewayVersion,
    maxVersion: `${gothamObjectsGatewayVersion.split(".")[0]}.x.x`,
    optional: true,
  },
};
for (const packageDir of PACKAGES_USING_SDK) {
  const packageJsonPath = path.join(REPO_DIR, packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  const sls = {
    ...packageJson.sls,
    dependencies: { ...packageJson.sls?.dependencies, ...minimums },
  };
  writeJson(packageJsonPath, withSls(packageJson, sls));
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function withSls(packageJson, sls) {
  const { sls: _previous, ...rest } = packageJson;
  const entries = Object.entries(rest);
  // Keep "sls" right before "type"; monorepolint checks the field order.
  const typeIndex = entries.findIndex(([key]) => key === "type");
  entries.splice(typeIndex === -1 ? entries.length : typeIndex, 0, ["sls", sls]);
  return Object.fromEntries(entries);
}

function rewriteNamespaceImports(sdkDir) {
  const pathsFile = path.join(sdkDir, "tsconfig.paths.json");
  const { paths } = readJson(pathsFile).compilerOptions;
  // Longest pattern first, so "@osdk/foundry.core/v2/*" wins over "@osdk/foundry.core/*".
  const mappings = Object.entries(paths).sort(([a], [b]) => b.length - a.length);

  for (const file of listFiles(sdkDir).filter(f => f.endsWith(".ts"))) {
    const source = fs.readFileSync(file, "utf8");
    const rewritten = source.replace(/from "(@osdk\/foundry\.[^"]+)"/g, (_match, specifier) => {
      const target = resolveSpecifier(specifier, mappings, sdkDir);
      const relativePath = path.relative(path.dirname(file), target).replace(/\.ts$/, ".js");
      return `from "${relativePath.startsWith(".") ? relativePath : `./${relativePath}`}"`;
    });
    if (rewritten !== source) {
      fs.writeFileSync(file, rewritten);
    }
  }
  fs.rmSync(pathsFile);
}

function resolveSpecifier(specifier, mappings, sdkDir) {
  for (const [pattern, [target]] of mappings) {
    if (pattern.endsWith("/*") && specifier.startsWith(pattern.slice(0, -1))) {
      return path.join(sdkDir, target.replace("*", specifier.slice(pattern.length - 1)));
    }
    if (specifier === pattern) {
      return path.join(sdkDir, target);
    }
  }
  throw new Error(`No tsconfig.paths.json entry matches "${specifier}"`);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, f))
    .filter(f => fs.statSync(f).isFile());
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: REPO_DIR, stdio: "inherit" });
}
