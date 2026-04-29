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
import type {
  IFieldTypeUnion,
  IRealTimeDocumentSchema,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import {
  convertFieldTypeToDescriptor,
  convertFieldTypeToInternalTypeScript,
  convertFieldTypeToInternalZod,
} from "../ir/irFieldHelpers.js";
import type { VersionedIrEntry } from "./resolveSchemaChain.js";
import { resolveSchemaChain } from "./resolveSchemaChain.js";

export interface InternalTypesOutput {
  /** _internal/types.ts content */
  internalTypes: string;
  /** _internal/upgrades.ts content */
  upgrades: string;
  /** _internal/schema.ts content */
  internalSchema: string;
}

/** Collected info about all fields for a model across all versions. */
interface AllFieldInfo {
  fieldType: IFieldTypeUnion;
  isOptional: boolean;
  /** Versions where this field exists. */
  presentInVersions: Set<number>;
  /** Whether field is always optional. */
  alwaysOptional: boolean;
  /** Whether field is optional in at least one version. */
  everOptional: boolean;
}

/**
 * Represents an upgrade step for a model between version transitions.
 */
interface UpgradeStep {
  name: string;
  addedInVersion: number;
  fields: Map<string, { derivedFrom: string[]; forwardSource: string; default?: unknown }>;
  removedFields: string[];
}

interface RecordModelInfo {
  allFields: Map<string, AllFieldInfo>;
  steps: UpgradeStep[];
}

/**
 * Helper to iterate sorted entries of a Map.
 */
function sortedEntries<V>(map: Map<string, V>): [string, V][] {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Collect all record model info across all versions and compute upgrade steps.
 */
function collectRecordModels(
  chain: VersionedIrEntry[],
): Map<string, RecordModelInfo> {
  const allRecordModels = new Map<string, RecordModelInfo>();

  // Initialize models from all versions
  for (const { version, ir } of chain) {
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type !== "record") continue;

      if (!allRecordModels.has(modelKey)) {
        allRecordModels.set(modelKey, {
          allFields: new Map(),
          steps: [],
        });
      }

      const model = allRecordModels.get(modelKey)!;

      for (const field of modelDef.record.fields) {
        const existing = model.allFields.get(field.key);
        if (existing == null) {
          model.allFields.set(field.key, {
            fieldType: field.fieldType,
            isOptional: field.isOptional === true,
            presentInVersions: new Set([version]),
            alwaysOptional: field.isOptional === true,
            everOptional: field.isOptional === true,
          });
        } else {
          existing.presentInVersions.add(version);
          if (field.isOptional !== true) {
            existing.alwaysOptional = false;
          }
          if (field.isOptional === true) {
            existing.everOptional = true;
          }
        }
      }
    }
  }

  // Compute upgrade steps from version diffs
  for (let i = 1; i < chain.length; i++) {
    const prevEntry = chain[i - 1]!;
    const currEntry = chain[i]!;

    for (const [modelKey, currModelDef] of Object.entries(currEntry.ir.models)) {
      if (currModelDef.type !== "record") continue;

      const prevModelDef = prevEntry.ir.models[modelKey];
      if (prevModelDef == null || prevModelDef.type !== "record") continue;

      const model = allRecordModels.get(modelKey);
      if (model == null) continue;

      const prevFields = new Set(prevModelDef.record.fields.map(f => f.key));
      const currFields = new Set(currModelDef.record.fields.map(f => f.key));

      // Fields added in this version
      const addedFields = new Map<
        string,
        { derivedFrom: string[]; forwardSource: string; default?: unknown }
      >();
      const recordUpgrades = currEntry.migrations?.[modelKey];
      for (const fieldKey of currFields) {
        if (!prevFields.has(fieldKey)) {
          const annotation = recordUpgrades?.[fieldKey];
          if (annotation != null) {
            addedFields.set(fieldKey, {
              derivedFrom: [...annotation.derivedFrom],
              forwardSource: annotation.forward.toString(),
            });
          } else {
            addedFields.set(fieldKey, {
              derivedFrom: [],
              forwardSource: "() => undefined",
            });
          }
        }
      }

      // Fields removed in this version
      const removedFields: string[] = [];
      for (const fieldKey of prevFields) {
        if (!currFields.has(fieldKey)) {
          removedFields.push(fieldKey);
        }
      }

      if (addedFields.size > 0 || removedFields.length > 0) {
        model.steps.push({
          name: `v${currEntry.version}`,
          addedInVersion: currEntry.version,
          fields: addedFields,
          removedFields,
        });
      }
    }
  }

  // Mark fields that are not present in ALL versions as optional in internal type
  const totalVersions = chain.length;
  for (const model of allRecordModels.values()) {
    for (const [, fieldInfo] of model.allFields) {
      if (fieldInfo.presentInVersions.size < totalVersions) {
        fieldInfo.alwaysOptional = true;
      }
    }
  }

  return allRecordModels;
}

/**
 * Generate _internal/types.ts content.
 */
function generateInternalTypes(
  allRecordModels: Map<string, RecordModelInfo>,
): string {
  let output = GENERATED_FILE_HEADER;
  output += "\n";

  for (const [modelKey, model] of sortedEntries(allRecordModels)) {
    output += `/** Internal representation containing all fields across all schema versions. */\n`;
    output += `export interface ${modelKey}__Internal {\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const tsType = convertFieldTypeToInternalTypeScript(
        fieldInfo.fieldType,
        fieldInfo.isOptional,
      );
      const optional = fieldInfo.alwaysOptional ? "?" : "";
      output += `  readonly ${fieldName}${optional}: ${tsType};\n`;
    }

    output += "}\n\n";
  }

  return output;
}

/**
 * Generate _internal/upgrades.ts content.
 */
function generateUpgrades(
  allRecordModels: Map<string, RecordModelInfo>,
  latestIr: IRealTimeDocumentSchema,
): string {
  let output = GENERATED_FILE_HEADER;

  const hasRecords = allRecordModels.size > 0;
  const hasUnions = Object.values(latestIr.models).some(m => m.type === "union");

  const imports: string[] = [];
  if (hasRecords) imports.push("UpgradeRegistry");
  if (hasUnions) imports.push("UnionUpgradeRegistry");

  if (imports.length > 0) {
    output += `import type { ${
      imports.join(", ")
    } } from "@palantir/pack.document-schema.model-types";\n\n`;
  }

  for (const [modelKey, model] of sortedEntries(allRecordModels)) {
    output += `export const ${modelKey}Upgrades: UpgradeRegistry<"${modelKey}"> = {\n`;
    output += `  modelName: "${modelKey}",\n`;

    // allFields
    output += `  allFields: {\n`;
    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      const typeDescriptor = convertFieldTypeToDescriptor(
        fieldInfo.fieldType,
        fieldInfo.isOptional,
      );
      output += `    ${fieldName}: { type: ${typeDescriptor} },\n`;
    }
    output += `  },\n`;

    // steps
    output += `  steps: [\n`;
    for (const step of model.steps) {
      output += `    {\n`;
      output += `      name: "${step.name}",\n`;
      output += `      addedInVersion: ${step.addedInVersion},\n`;
      output += `      fields: {\n`;
      for (const [fieldName, fieldMeta] of step.fields) {
        output += `        ${fieldName}: {\n`;
        output += `          derivedFrom: [${
          fieldMeta.derivedFrom.map(d => `"${d}"`).join(", ")
        }],\n`;
        output += `          forward: ${fieldMeta.forwardSource},\n`;
        if (fieldMeta.default !== undefined) {
          output += `          default: ${JSON.stringify(fieldMeta.default)},\n`;
        }
        output += `        },\n`;
      }
      output += `      },\n`;
      if (step.removedFields.length > 0) {
        output += `      removedFields: [${step.removedFields.map(f => `"${f}"`).join(", ")}],\n`;
      }
      output += `    },\n`;
    }
    output += `  ],\n`;

    output += `};\n\n`;
  }

  // Generate UnionUpgradeRegistry entries for union models
  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    if (modelDef.type !== "union") continue;

    const union = modelDef.union;
    output += `export const ${modelKey}Upgrades: UnionUpgradeRegistry<"${modelKey}"> = {\n`;
    output += `  modelName: "${modelKey}",\n`;
    output += `  discriminant: "${union.discriminant}",\n`;
    output += `  variants: {\n`;
    for (const [variantKey, variantModelKey] of Object.entries(union.variants)) {
      output += `    "${variantKey}": "${variantModelKey}",\n`;
    }
    output += `  },\n`;
    output += `};\n\n`;
  }

  return output;
}

/**
 * Generate _internal/schema.ts content.
 */
function generateInternalSchemaContent(
  allRecordModels: Map<string, RecordModelInfo>,
): string {
  let output = GENERATED_FILE_HEADER;
  output += `import { z } from "zod";\n\n`;

  for (const [modelKey, model] of sortedEntries(allRecordModels)) {
    output += `export const ${modelKey}InternalSchema = z.object({\n`;

    for (const [fieldName, fieldInfo] of sortedEntries(model.allFields)) {
      // Use everOptional: a field optional in ANY version must stay optional
      // in the internal schema because older documents may legitimately omit it.
      const zodType = convertFieldTypeToInternalZod(
        fieldInfo.fieldType,
        fieldInfo.alwaysOptional || fieldInfo.everOptional,
      );
      output += `  ${fieldName}: ${zodType},\n`;
    }

    output += `}).passthrough();\n\n`;
  }

  return output;
}

/**
 * Generate _internal/types.ts, _internal/upgrades.ts, and _internal/schema.ts
 * from a versioned schema chain.
 *
 * @param schema - The schema definition (initial or versioned)
 * @returns Object containing generated code for each internal file
 */
export function generateInternalFromSchema(
  schema: SchemaDefinition,
): InternalTypesOutput {
  const { chain } = resolveSchemaChain(schema);
  const latestIr = chain[chain.length - 1]!.ir;

  const allRecordModels = collectRecordModels(chain);

  const internalTypes = generateInternalTypes(allRecordModels);
  const upgrades = generateUpgrades(allRecordModels, latestIr);
  const internalSchema = generateInternalSchemaContent(allRecordModels);

  return { internalTypes, upgrades, internalSchema };
}
