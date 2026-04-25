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

import type { SchemaDefinition } from "@palantir/pack.schema";
import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { formatVariantName } from "../formatVariantName.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import {
  collectReferencedTypes,
  convertFieldTypeToTypeScript,
  detectUsedRefTypes,
} from "../ir/irFieldHelpers.js";
import type { VersionedIrEntry } from "./resolveSchemaChain.js";
import { resolveSchemaChain } from "./resolveSchemaChain.js";
import { typesFilePath, versionedTypeName, versionedWriteTypeName } from "./runtimeSchema.js";

export interface VersionedTypesOutput {
  /** types_vN.ts files keyed by version number */
  readTypes: Map<number, string>;
  /** writeTypes_vN.ts files keyed by version number */
  writeTypes: Map<number, string>;
  /** types.ts re-export of latest version types under unversioned names */
  typesReExport: string;
}

/**
 * Generate read types for a specific schema version.
 */
function generateReadTypesForVersion(
  version: number,
  ir: IRealTimeDocumentSchema,
): string {
  const usedRefTypes = detectUsedRefTypes(ir);

  let output = GENERATED_FILE_HEADER;

  if (usedRefTypes.size > 0) {
    const refTypesList = Array.from(usedRefTypes).sort().join(", ");
    output +=
      `import type { ${refTypesList} } from "@palantir/pack.document-schema.model-types";\n`;
  }

  output += "\n";

  // Generate record interfaces
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type !== "record") continue;

    const record = modelDef.record;
    const typeName = versionedTypeName(modelKey, version);

    if (record.description) {
      output += `/**\n * ${record.description}\n */\n`;
    }

    output += `export interface ${typeName} {\n`;

    for (const field of record.fields) {
      const tsType = convertFieldTypeToTypeScript(field.fieldType, ir, version);
      const optional = field.isOptional ? "?" : "";
      output += `  readonly ${field.key}${optional}: ${tsType};\n`;
    }

    output += "}\n\n";
  }

  // Generate union types
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type !== "union") continue;

    const union = modelDef.union;
    const typeName = versionedTypeName(modelKey, version);
    const discriminantField = union.discriminant;
    const variantInterfaces: Array<{ name: string; discriminatorValue: string }> = [];

    for (const [variantName, variantModelKey] of Object.entries(union.variants)) {
      const interfaceName = `${typeName}${formatVariantName(variantName)}`;
      variantInterfaces.push({ name: interfaceName, discriminatorValue: variantName });

      // Look up the variant's model to check if it's a record
      const variantModel = ir.models[variantModelKey];
      if (variantModel != null && variantModel.type === "record") {
        const recordTypeName = versionedTypeName(variantModelKey, version);
        output += `export interface ${interfaceName} extends ${recordTypeName} {\n`;
        output += `  readonly ${discriminantField}: "${variantName}";\n`;
        output += "}\n\n";
      } else {
        output += `export interface ${interfaceName} {\n`;
        output += `  readonly ${discriminantField}: "${variantName}";\n`;
        output += "}\n\n";
      }
    }

    output += `export type ${typeName} = ${variantInterfaces.map(v => v.name).join(" | ")};\n\n`;

    for (const variant of variantInterfaces) {
      output +=
        `export function is${variant.name}(value: ${typeName}): value is ${variant.name} {\n`;
      output += `  return value.${discriminantField} === "${variant.discriminatorValue}";\n`;
      output += "}\n\n";
    }
  }

  return output;
}

/**
 * Generate write types for a specific schema version.
 * All fields are optional in write types.
 */
function generateWriteTypesForVersion(
  version: number,
  ir: IRealTimeDocumentSchema,
): string {
  const usedRefTypes = detectUsedRefTypes(ir);

  // Collect referenced schema-local types (refs to other records/unions)
  const referencedLocalTypes = new Set<string>();
  for (const modelDef of Object.values(ir.models)) {
    if (modelDef.type !== "record") continue;
    for (const field of modelDef.record.fields) {
      collectReferencedTypes(field.fieldType, version, referencedLocalTypes);
    }
  }

  let output = GENERATED_FILE_HEADER;

  if (usedRefTypes.size > 0) {
    const refTypesList = Array.from(usedRefTypes).sort().join(", ");
    output +=
      `import type { ${refTypesList} } from "@palantir/pack.document-schema.model-types";\n`;
  }

  if (referencedLocalTypes.size > 0) {
    const localTypesList = Array.from(referencedLocalTypes).sort().join(", ");
    output += `import type { ${localTypesList} } from "${typesFilePath(version)}";\n`;
  }

  output += "\n";

  // Generate record write types
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type !== "record") continue;

    const typeName = versionedWriteTypeName(modelKey, version);

    output += `export type ${typeName} = {\n`;

    for (const field of modelDef.record.fields) {
      // All fields are optional in write types
      const tsType = convertFieldTypeToTypeScript(field.fieldType, ir, version);
      output += `  readonly ${field.key}?: ${tsType};\n`;
    }

    output += "};\n\n";
  }

  return output;
}

/**
 * Generate the types.ts re-export file that maps unversioned names to the latest version.
 */
function generateTypesReExport({ ir, version }: VersionedIrEntry): string {
  const reExports: string[] = [];
  for (const [modelKey, modelDef] of Object.entries(ir.models)) {
    if (modelDef.type === "record") {
      const versioned = versionedTypeName(modelKey, version);
      reExports.push(
        `export type { ${versioned} as ${modelKey} } from "${typesFilePath(version)}";`,
      );
    } else if (modelDef.type === "union") {
      const versioned = versionedTypeName(modelKey, version);
      reExports.push(
        `export type { ${versioned} as ${modelKey} } from "${typesFilePath(version)}";`,
      );

      // Also re-export union variant types
      for (const variantName of Object.keys(modelDef.union.variants)) {
        const formattedVariant = formatVariantName(variantName);
        const versionedVariant = `${versionedTypeName(modelKey, version)}${formattedVariant}`;
        const unversionedVariant = `${modelKey}${formattedVariant}`;
        reExports.push(
          `export type { ${versionedVariant} as ${unversionedVariant} } from "${
            typesFilePath(version)
          }";`,
        );
      }
    }
  }

  return GENERATED_FILE_HEADER + reExports.join("\n") + "\n";
}

/**
 * Generate per-version public types and write types from a schema with version chain.
 *
 * @param schema - The schema, initial or versioned
 * @param minSupportedVersion - Minimum version to generate types for (defaults to latest)
 * @returns Object containing generated code for each output file
 */
export function generateVersionedTypesFromSchema(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
): VersionedTypesOutput {
  const { chain, latestVersion, minVersion } = resolveSchemaChain(schema, minSupportedVersion);

  const readTypes = new Map<number, string>();
  const writeTypes = new Map<number, string>();

  for (const { version, ir } of chain) {
    if (version < minVersion) continue;

    readTypes.set(version, generateReadTypesForVersion(version, ir));
    writeTypes.set(version, generateWriteTypesForVersion(version, ir));
  }

  const typesReExport = generateTypesReExport(chain[chain.length - 1]!);

  return { readTypes, writeTypes, typesReExport };
}
