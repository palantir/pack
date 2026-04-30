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

import { consola } from "consola";
import fs from "fs-extra";
import path from "path";
import { resolveMinVersion, type VersionedIrEntry } from "../../utils/schema/resolveSchemaChain.js";
import { parseMinVersion, writeAllSdkFiles } from "../../utils/schema/writeAllSdkFiles.js";

interface IrGenTypesOptions {
  schema: string;
  output: string;
  minVersion?: string;
}

interface IrChainPayload {
  __comment?: string;
  latestVersion: number;
  chain: VersionedIrEntry[];
}

export async function irGenTypesHandler(options: IrGenTypesOptions): Promise<void> {
  const { schema: schemaPath, output: outputDir } = options;

  const inputPath = path.resolve(schemaPath);
  if (!(await fs.pathExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  consola.info(`Loading IR chain from: ${inputPath}`);
  const payload = (await fs.readJson(inputPath)) as IrChainPayload;

  if (!Array.isArray(payload.chain) || payload.chain.length === 0) {
    throw new Error(`Invalid IR chain payload at ${inputPath}: missing non-empty 'chain' array`);
  }

  const minSupportedVersion = parseMinVersion(options.minVersion);
  const { latestVersion, minVersion } = resolveMinVersion(payload.chain, minSupportedVersion);
  const resolved = { chain: payload.chain, latestVersion, minVersion };

  const resolvedOutputDir = path.resolve(outputDir);
  await writeAllSdkFiles(resolved, resolvedOutputDir, minSupportedVersion);
}
