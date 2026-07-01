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

import type { DocumentTypeAsset, FileSystemType } from "@osdk/foundry.pack";
import { CommanderError } from "commander";
import { consola } from "consola";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { GENERATED_JSON_COMMENT } from "../../utils/generatedFileHeader.js";
import { convertIrToWireSchema } from "../../utils/ir/convertIrToWireSchema.js";
import { resolveIrInput } from "./resolveIrInput.js";

interface IrGenAssetOptions {
  readonly ir: string;
  readonly output: string;
  readonly fileSystemType?: FileSystemType;
  readonly compatibilityRangeOutput?: string;
}

interface SchemaCompatibilityRangeFile {
  readonly min: number;
  readonly max: number;
}

function deriveCompatibilityRangePath(assetOutputPath: string): string {
  const stem = basename(assetOutputPath, extname(assetOutputPath));
  return join(dirname(assetOutputPath), `${stem}-schema-compatibility-range.json`);
}

/**
 * Generates a document type asset JSON file (and a sibling schema
 * compatibility range JSON file) from an IR schema.
 *
 * The input IR may be either:
 *  - a chain payload `{ latestVersion, minSupportedVersion?, chain }` produced
 *    by `schema ir`. The latest entry's `ir` is used as the wire schema; the
 *    asset's `schemaVersion` is `latestVersion`; the compatibility range is
 *    `{ min: minSupportedVersion ?? latestVersion, max: latestVersion }`.
 *  - a bare single-version `IRealTimeDocumentSchema` (legacy). The compat
 *    range defaults to `{ min: version, max: version }` since no chain
 *    information is available.
 *
 * This command is intended for internal platform applications where the
 * document type asset must exist on disk so the platform can discover it and
 * register the document type automatically at deploy time. Most users should
 * use `ir deploy` to register document types via the Foundry API instead.
 *
 * If you are unsure whether you need this command, you almost certainly do not.
 */
export function irGenAssetHandler(options: IrGenAssetOptions): void {
  try {
    const irPath = resolve(options.ir);
    const outputPath = resolve(options.output);

    if (!existsSync(irPath)) {
      throw new CommanderError(1, "ENOENT", `IR file does not exist: ${irPath}`);
    }

    consola.info(`Reading IR schema from: ${irPath}`);
    const parsed = JSON.parse(readFileSync(irPath, "utf8")) as unknown;

    const resolved = resolveIrInput(parsed, irPath);

    const { ir: irSchema, latestVersion, minSupportedVersion } = resolved;
    const { name: documentTypeName } = irSchema;
    const wireSchema = convertIrToWireSchema(irSchema);

    const fileSystemType = options.fileSystemType ?? "ARTIFACTS";
    if (fileSystemType !== "ARTIFACTS" && fileSystemType !== "COMPASS") {
      throw new CommanderError(
        1,
        "EINVAL",
        `Invalid fileSystemType "${fileSystemType}". Must be "ARTIFACTS" or "COMPASS".`,
      );
    }

    const asset: DocumentTypeAsset = {
      comment: GENERATED_JSON_COMMENT,
      documentTypeName,
      documentStorageType: {
        type: "yjs",
        schema: wireSchema,
      },
      fileSystemType,
      schemaVersion: latestVersion,
    };

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(asset, null, 2), "utf8");

    const compatibilityRange: SchemaCompatibilityRangeFile = {
      min: minSupportedVersion,
      max: latestVersion,
    };
    const compatibilityRangePath = resolve(
      options.compatibilityRangeOutput ?? deriveCompatibilityRangePath(outputPath),
    );
    const compatibilityRangeDir = dirname(compatibilityRangePath);
    if (!existsSync(compatibilityRangeDir)) {
      mkdirSync(compatibilityRangeDir, { recursive: true });
    }
    const compatibilityRangeOutput = {
      comment: GENERATED_JSON_COMMENT,
      ...compatibilityRange,
    };
    writeFileSync(
      compatibilityRangePath,
      JSON.stringify(compatibilityRangeOutput, null, 2),
      "utf8",
    );

    consola.success("Successfully generated document type asset");
    consola.info(`   Output: ${outputPath}`);
    consola.info(`   Compatibility range output: ${compatibilityRangePath}`);
    consola.info(`   Document type: ${documentTypeName}`);
    consola.info(`   Schema version: ${latestVersion}`);
    consola.info(`   Compatibility range: [${minSupportedVersion}, ${latestVersion}]`);
    consola.info(`   File system type: ${fileSystemType}`);
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    consola.error("Error generating document type asset:", error);
    throw new CommanderError(1, "IR_ASSET_ERROR", "Failed to generate document type asset");
  }
}
