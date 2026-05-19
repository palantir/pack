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

import type { IRecordDef } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import { findExternalRefType } from "../ir/irFieldHelpers.js";
import type { ResolvedIrChain } from "./resolveSchemaChain.js";
import { chainHasDerivedFields, resolveMinVersion } from "./resolveSchemaChain.js";
import {
  INTERNAL_UPGRADE_FNS_PATH,
  INTERNAL_UPGRADES_PATH,
  modelName,
  SCHEMA_REEXPORT_PATH,
  schemaName,
  TYPES_REEXPORT_PATH,
} from "./runtimeSchema.js";

export interface ModelMetadataOutput {
  /** models.ts content -- DocumentModel with version metadata and upgrade references */
  modelsFile: string;
}

function extractExternalRefFieldTypes(
  record: IRecordDef,
): Array<[string, string]> {
  const refs: Array<[string, string]> = [];
  for (const field of record.fields) {
    const refType = findExternalRefType(field.fieldType);
    if (refType != null) {
      refs.push([field.key, refType]);
    }
  }
  return refs;
}

/**
 * Generate models.ts from an already-resolved versioned IR chain.
 */
export function generateModelMetadataFromChain(
  resolved: ResolvedIrChain,
  minSupportedVersion?: number,
): ModelMetadataOutput {
  const { chain } = resolved;
  const { latestVersion, minVersion } = resolveMinVersion(chain, minSupportedVersion);
  const latestIr = chain[chain.length - 1]!.ir;
  const hasDerivedFields = chainHasDerivedFields(chain);

  // --- Generate models.ts ---
  let output = GENERATED_FILE_HEADER;

  // Collect model names for imports
  const recordNames: string[] = [];
  const unionNames: string[] = [];
  const variantNames: string[] = [];

  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    if (modelDef.type === "record") {
      recordNames.push(modelKey);
    } else if (modelDef.type === "union") {
      unionNames.push(modelKey);
      for (const variantName of Object.keys(modelDef.union.variants)) {
        variantNames.push(`${modelKey}${formatVariantName(variantName)}`);
      }
    }
  }

  const allModelNames = [...recordNames, ...unionNames, ...variantNames].sort();

  // Imports
  const modelTypesImports: string[] = ["DocumentSchema"];
  if (recordNames.length > 0) modelTypesImports.push("RecordModel");
  if (unionNames.length > 0) modelTypesImports.push("UnionModel");
  if (hasDerivedFields) modelTypesImports.push("UpgradeFns");

  output += `import type { ${
    modelTypesImports.sort().join(", ")
  } } from "@palantir/pack.document-schema.model-types";\n`;
  output += `import { Metadata } from "@palantir/pack.document-schema.model-types";\n`;

  if (allModelNames.length > 0) {
    output += `import type { ${allModelNames.join(", ")} } from "${TYPES_REEXPORT_PATH}";\n`;
  }

  // Schema imports
  const schemaNames = allModelNames.map(n => schemaName(n));
  if (schemaNames.length > 0) {
    output += `import { ${schemaNames.join(", ")} } from "${SCHEMA_REEXPORT_PATH}";\n`;
  }

  // Upgrade imports (only if there are upgrades)
  const upgradeNames = [...recordNames, ...unionNames].map(n => `${n}Upgrades`);
  if (chain.length > 1 && upgradeNames.length > 0) {
    output += `import { ${upgradeNames.join(", ")} } from "${INTERNAL_UPGRADES_PATH}";\n`;
  }

  // DocumentUpgradeFns type is needed by the factory's parameter signature.
  if (hasDerivedFields) {
    output += `import type { DocumentUpgradeFns } from "${INTERNAL_UPGRADE_FNS_PATH}";\n`;
  }

  output += "\n";

  // Generate model constants
  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    if (modelDef.type === "record") {
      const externalRefs = extractExternalRefFieldTypes(modelDef.record);
      const metadataFields: string[] = [];

      if (externalRefs.length > 0) {
        const entries = externalRefs.map(([field, type]) => `      ${field}: "${type}",`).join(
          "\n",
        );
        metadataFields.push(`    externalRefFieldTypes: {\n${entries}\n    },`);
      }
      metadataFields.push(`    name: "${modelKey}",`);

      output += `export interface ${modelName(modelKey)} extends RecordModel<${modelKey}, typeof ${
        schemaName(modelKey)
      }> {}\n`;
      output += `export const ${modelName(modelKey)}: ${modelName(modelKey)} = {\n`;
      output += `  __type: {} as ${modelKey},\n`;
      output += `  zodSchema: ${schemaName(modelKey)},\n`;
      output += `  [Metadata]: {\n${metadataFields.join("\n")}\n  },\n`;
      output += `};\n\n`;
    } else if (modelDef.type === "union") {
      const union = modelDef.union;
      const metadataFields: string[] = [];
      metadataFields.push(`    discriminant: "${union.discriminant}",`);
      metadataFields.push(`    name: "${modelKey}",`);

      output += `export interface ${modelName(modelKey)} extends UnionModel<${modelKey}, typeof ${
        schemaName(modelKey)
      }> {}\n`;
      output += `export const ${modelName(modelKey)}: ${modelName(modelKey)} = {\n`;
      output += `  __type: {} as ${modelKey},\n`;
      output += `  zodSchema: ${schemaName(modelKey)},\n`;
      output += `  [Metadata]: {\n${metadataFields.join("\n")}\n  },\n`;
      output += `};\n\n`;

      // Generate variant models
      for (const variantName of Object.keys(union.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const variantTypeName = `${modelKey}${formattedVariant}`;
        const variantMetadata: string[] = [];
        variantMetadata.push(`    discriminant: "${union.discriminant}",`);
        variantMetadata.push(`    name: "${variantTypeName}",`);

        output += `export interface ${
          modelName(variantTypeName)
        } extends UnionModel<${variantTypeName}, typeof ${schemaName(variantTypeName)}> {}\n`;
        output += `export const ${modelName(variantTypeName)}: ${modelName(variantTypeName)} = {\n`;
        output += `  __type: {} as ${variantTypeName},\n`;
        output += `  zodSchema: ${schemaName(variantTypeName)},\n`;
        output += `  [Metadata]: {\n${variantMetadata.join("\n")}\n  },\n`;
        output += `};\n\n`;
      }
    }
  }

  // Generate DocumentModel
  const modelEntries: string[] = [];
  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    if (modelDef.type === "record") {
      modelEntries.push(`  ${modelKey}: ${modelName(modelKey)}`);
    } else if (modelDef.type === "union") {
      modelEntries.push(`  ${modelKey}: ${modelName(modelKey)}`);
      for (const variantName of Object.keys(modelDef.union.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const variantTypeName = `${modelKey}${formattedVariant}`;
        modelEntries.push(`  ${variantTypeName}: ${modelName(variantTypeName)}`);
      }
    }
  }

  // Build upgrades map (includes both record and union entries)
  let upgradesBlock: string;
  const allUpgradeNames = [...recordNames, ...unionNames];
  if (chain.length > 1 && allUpgradeNames.length > 0) {
    const upgradeEntries = allUpgradeNames.map(n => `        ${n}: ${n}Upgrades,`).join("\n");
    upgradesBlock = `      upgrades: {\n${upgradeEntries}\n      },\n`;
  } else {
    upgradesBlock = "";
  }

  // Common metadata literal: shared between the const and factory forms.
  let metadataBody = `    [Metadata]: {\n`;
  metadataBody += `      version: ${latestVersion},\n`;
  if (minVersion !== latestVersion) {
    metadataBody += `      minSupportedVersion: ${minVersion},\n`;
  }
  metadataBody += upgradesBlock;

  const modelEntriesBody = modelEntries.map(e => `  ${e}`).join(",\n");

  if (hasDerivedFields) {
    // Factory form: schema has derived fields, so the runtime requires the app
    // to supply typed upgrade functions. The factory makes this a compile-time
    // requirement — apps can't get a DocumentSchema value without passing them.
    output += `/**\n`;
    output += ` * Construct the DocumentModel for this SDK, wiring in the typed forward\n`;
    output += ` * functions the runtime needs to materialize derived fields.\n`;
    output += ` */\n`;
    output += `export function DocumentModel(upgradeFns: DocumentUpgradeFns): DocumentSchema {\n`;
    output += `  return {\n`;
    output += `${modelEntriesBody},\n`;
    output += metadataBody;
    output += `      upgradeFns: upgradeFns as unknown as UpgradeFns,\n`;
    output += `    },\n`;
    output += `  };\n`;
    output += `}\n\n`;
    output += `export type DocumentModel = ReturnType<typeof DocumentModel>;\n`;
  } else {
    // Const form: no derived fields means no upgrade functions are required.
    output += `export const DocumentModel = {\n`;
    output += `${modelEntriesBody},\n`;
    // Const form indents one level less than the factory body.
    output += metadataBody.replace(/^ {4}/gm, "  ");
    output += `  },\n`;
    output += `} as const satisfies DocumentSchema;\n\n`;
    output += `export type DocumentModel = typeof DocumentModel;\n`;
  }

  return { modelsFile: output };
}
