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
import { resolveSchemaChain } from "../../utils/schema/resolveSchemaChain.js";

interface SchemaIrOptions {
  input: string;
  output: string;
  config: string;
  maxVersion?: string;
}

interface PackConfigLike {
  documentTypeName?: unknown;
  documentTypeDescription?: unknown;
  minSupportedVersion?: unknown;
  owningApplicationId?: unknown;
}

interface PackConfigValues {
  readonly documentTypeName: string;
  readonly documentTypeDescription: string;
  readonly minSupportedVersion?: number;
  readonly owningApplicationId?: string;
}

function assertNonEmptyString(value: unknown, field: string, configPath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `'${field}' in ${configPath} must be a non-empty string, got: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function readRequiredNonEmptyString(
  value: unknown,
  field: string,
  configPath: string,
): string {
  if (value == null) {
    throw new Error(
      `'${field}' is required in ${configPath} and must be a non-empty string`,
    );
  }
  return assertNonEmptyString(value, field, configPath);
}

export async function readPackConfig(configPath: string): Promise<PackConfigValues> {
  const resolvedConfigPath = path.resolve(configPath);
  if (!(await fs.pathExists(resolvedConfigPath))) {
    throw new Error(`--config file not found: ${resolvedConfigPath}`);
  }
  const config = (await fs.readJson(resolvedConfigPath)) as PackConfigLike;

  const documentTypeName = readRequiredNonEmptyString(
    config.documentTypeName,
    "documentTypeName",
    resolvedConfigPath,
  );

  const documentTypeDescription = readRequiredNonEmptyString(
    config.documentTypeDescription,
    "documentTypeDescription",
    resolvedConfigPath,
  );

  let minSupportedVersion: number | undefined;
  const rawMin = config.minSupportedVersion;
  if (rawMin != null) {
    if (typeof rawMin !== "number" || !Number.isInteger(rawMin) || rawMin <= 0) {
      throw new Error(
        `'minSupportedVersion' in ${resolvedConfigPath} must be a positive integer, got: ${
          JSON.stringify(rawMin)
        }`,
      );
    }
    minSupportedVersion = rawMin;
  }

  let owningApplicationId: string | undefined;
  if (config.owningApplicationId != null) {
    owningApplicationId = assertNonEmptyString(
      config.owningApplicationId,
      "owningApplicationId",
      resolvedConfigPath,
    );
  }

  return { documentTypeName, documentTypeDescription, minSupportedVersion, owningApplicationId };
}

function parseMaxVersion(maxVersion: string | undefined): number | undefined {
  if (maxVersion == null) {
    return undefined;
  }

  if (!/^[1-9]\d*$/.test(maxVersion)) {
    throw new Error(
      `--max-version must be a positive integer, got: ${JSON.stringify(maxVersion)}`,
    );
  }

  return Number(maxVersion);
}

/**
 * Resolve a TypeScript schema module to a versioned IR chain JSON file.
 *
 * The output is a `{ latestVersion, minSupportedVersion?, chain }` payload
 * where each entry is `{ version, ir, migrations? }` and `ir` is a
 * single-version `IRealTimeDocumentSchema`. This is the input format for
 * `ir gen-types` and `ir asset`.
 *
 * `--config <pack-config.json>` is required: the pack-config is the single
 * source of truth for document-type identity. Required fields:
 *  - `documentTypeName`: the document type name embedded into each chain
 *    entry's IR (and surfaced as `documentTypeName` by `ir asset`).
 *  - `documentTypeDescription`: document type description embedded into each
 *    chain entry's IR.
 * Optional fields:
 *  - `minSupportedVersion`: declares the oldest version this SDK supports;
 *    when set, it must match one of the chain entries' `version` values and is
 *    embedded as `minSupportedVersion` in the payload so downstream consumers
 *    (`ir gen-types`, `ir asset`) read the same value. Omitting the field is
 *    an explicit opt-out: the IR will not include `minSupportedVersion` and
 *    downstream tools default to supporting only the latest schema version.
 *  - `owningApplicationId`: the application that owns this document type; when
 *    set, it is embedded in the payload and surfaced as `owningApplicationId`
 *    by `ir asset`.
 *
 * Note: this is distinct from the legacy single-version IR JSON consumed by
 * `ir zod`, which is a bare `IRealTimeDocumentSchema` (no chain, no migrations).
 * Tools that previously read that format should pick the entry matching
 * `latestVersion` from `chain` and use its `ir` field.
 */
export async function schemaIrHandler(options: SchemaIrOptions): Promise<void> {
  const { input, output, config } = options;
  const maxVersion = parseMaxVersion(options.maxVersion);
  const { documentTypeName, documentTypeDescription, minSupportedVersion, owningApplicationId } =
    await readPackConfig(config);

  if (minSupportedVersion == null) {
    consola.warn(
      `--config ${
        path.resolve(config)
      } does not set 'minSupportedVersion'. The generated IR will not include it, so downstream tools (ir gen-types, ir asset) will default to supporting only the latest schema version. Add 'minSupportedVersion' to your pack-config to enable back-compat.`,
    );
  }

  consola.info(`Loading schema from: ${input}`);
  const schema = await loadSchemaModule(input);

  consola.info("Resolving versioned IR chain...");
  const { chain, latestVersion } = resolveSchemaChain(
    schema,
    minSupportedVersion,
    {
      name: documentTypeName,
      description: documentTypeDescription,
    },
    maxVersion,
  );

  const outputPath = path.resolve(output);
  await fs.ensureDir(path.dirname(outputPath));

  const payload = {
    comment: GENERATED_JSON_COMMENT,
    latestVersion,
    ...(minSupportedVersion != null ? { minSupportedVersion } : {}),
    ...(owningApplicationId != null ? { owningApplicationId } : {}),
    chain,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  consola.success(
    `Wrote IR chain (${chain.length} version(s), min=${
      minSupportedVersion ?? latestVersion
    }, max=${latestVersion}) to: ${outputPath}`,
  );
}
