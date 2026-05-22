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
import { GENERATED_JSON_COMMENT } from "../../utils/generatedFileHeader.js";
import { loadSchemaModule } from "../../utils/schema/loadSchemaModule.js";
import { resolveMinVersion, resolveSchemaChain } from "../../utils/schema/resolveSchemaChain.js";

interface SchemaIrOptions {
  input: string;
  output: string;
  config?: string;
}

interface PackConfigLike {
  minSupportedVersion?: unknown;
}

async function readMinVersionFromConfig(configPath: string): Promise<number | undefined> {
  const resolvedConfigPath = path.resolve(configPath);
  if (!(await fs.pathExists(resolvedConfigPath))) {
    throw new Error(`--config file not found: ${resolvedConfigPath}`);
  }
  const config = (await fs.readJson(resolvedConfigPath)) as PackConfigLike;
  const raw = config.minSupportedVersion;
  if (raw == null) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(
      `'minSupportedVersion' in ${resolvedConfigPath} must be a positive integer, got: ${
        JSON.stringify(raw)
      }`,
    );
  }
  return raw;
}

/**
 * Resolve a TypeScript schema module to a versioned IR chain JSON file.
 *
 * The output is a `{ latestVersion, minSupportedVersion?, chain }` payload
 * where each entry is `{ version, ir, migrations? }` and `ir` is a
 * single-version `IRealTimeDocumentSchema`. This is the input format for
 * `ir gen-types` and `ir asset`.
 *
 * The minimum supported schema version is sourced exclusively from the SDK's
 * pack-config file via `--config <pack-config.json>` (reading its `minSupportedVersion`
 * field). When provided, the value must match one of the chain entries'
 * `version` values; it is then embedded as `minSupportedVersion` in the
 * payload so downstream consumers (`ir gen-types`, `ir asset`) read the same
 * value without needing it forwarded to them. The pack-config is the single
 * source of truth for the minimum supported version.
 *
 * Note: this is distinct from the legacy single-version IR JSON consumed by
 * `ir deploy` / `ir zod`, which is a bare `IRealTimeDocumentSchema` (no chain,
 * no migrations). Tools that previously read that format should pick the
 * entry matching `latestVersion` from `chain` and use its `ir` field.
 */
export async function schemaIrHandler(options: SchemaIrOptions): Promise<void> {
  const { input, output } = options;
  const minSupportedVersion = options.config != null
    ? await readMinVersionFromConfig(options.config)
    : undefined;

  if (options.config == null) {
    consola.warn(
      "No --config provided. The generated IR will not include 'minSupportedVersion', so downstream tools (ir gen-types, ir asset) will default to supporting only the latest schema version. Pass --config <pack-config.json> with a 'minSupportedVersion' field to enable back-compat.",
    );
  } else if (minSupportedVersion == null) {
    consola.warn(
      `--config was provided but no 'minSupportedVersion' field is set in ${
        path.resolve(options.config)
      }. The generated IR will not include 'minSupportedVersion', so downstream tools (ir gen-types, ir asset) will default to supporting only the latest schema version. Add 'minSupportedVersion' to your pack-config to enable back-compat.`,
    );
  }

  consola.info(`Loading schema from: ${input}`);
  const schema = await loadSchemaModule(input);

  consola.info("Resolving versioned IR chain...");
  const { chain, latestVersion } = resolveSchemaChain(schema);

  resolveMinVersion(chain, minSupportedVersion);

  const outputPath = path.resolve(output);
  await fs.ensureDir(path.dirname(outputPath));

  const payload = {
    __comment: GENERATED_JSON_COMMENT,
    latestVersion,
    ...(minSupportedVersion != null ? { minSupportedVersion } : {}),
    chain,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  consola.success(
    `Wrote IR chain (${chain.length} version(s), min=${
      minSupportedVersion ?? latestVersion
    }, max=${latestVersion}) to: ${outputPath}`,
  );
}
