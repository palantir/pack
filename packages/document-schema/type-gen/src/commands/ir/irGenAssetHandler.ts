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

import { CommanderError } from "commander";
import { consola } from "consola";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";

type FileSystemType = "ARTIFACTS" | "COMPASS";

interface IrGenAssetOptions {
  readonly ir: string;
  readonly output: string;
  readonly fileSystemType?: FileSystemType;
}

interface DocumentTypeAsset {
  readonly documentTypeName: string;
  readonly documentStorageType: {
    readonly type: "yjs";
    readonly yjs: Omit<IRealTimeDocumentSchema, "name" | "description" | "version">;
  };
  readonly fileSystemType: FileSystemType;
  readonly schemaVersion: number;
}

/**
 * Generates a document type asset JSON file from an IR schema.
 *
 * @remarks
 * This command is intended for internal platform applications where the document
 * type asset must exist on disk so the platform can discover it and register the
 * document type automatically at deploy time. Most users should use `ir deploy`
 * to register document types via the Foundry API instead.
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
    const {
      name: documentTypeName,
      description: _description,
      version: schemaVersion,
      ...irSchema
    } = JSON.parse(
      readFileSync(irPath, "utf8"),
    ) as IRealTimeDocumentSchema;

    const fileSystemType = options.fileSystemType ?? "ARTIFACTS";
    if (fileSystemType !== "ARTIFACTS" && fileSystemType !== "COMPASS") {
      throw new CommanderError(
        1,
        "EINVAL",
        `Invalid fileSystemType "${fileSystemType}". Must be "ARTIFACTS" or "COMPASS".`,
      );
    }

    const asset: DocumentTypeAsset = {
      documentTypeName,
      documentStorageType: {
        type: "yjs",
        yjs: irSchema,
      },
      fileSystemType,
      schemaVersion,
    };

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(asset, null, 2), "utf8");

    consola.success("Successfully generated document type asset");
    consola.info(`   Output: ${outputPath}`);
    consola.info(`   Document type: ${documentTypeName}`);
    consola.info(`   Schema version: ${schemaVersion}`);
    consola.info(`   File system type: ${fileSystemType}`);
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }
    consola.error("Error generating document type asset:", error);
    throw new CommanderError(1, "IR_ASSET_ERROR", "Failed to generate document type asset");
  }
}
