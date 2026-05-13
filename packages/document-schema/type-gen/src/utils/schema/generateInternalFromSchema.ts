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

import type {
  IFieldDef,
  IFieldTypeUnion,
  IRealTimeDocumentSchema,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { GENERATED_FILE_HEADER } from "../generatedFileHeader.js";
import {
  convertFieldTypeToDescriptor,
  convertFieldTypeToInternalTypeScript,
  convertFieldTypeToInternalZod,
} from "../ir/irFieldHelpers.js";
import type { ResolvedIrChain, VersionedIrEntry } from "./resolveSchemaChain.js";

export interface InternalTypesOutput {
  /** _internal/types.ts content */
  internalTypes: string;
  /** _internal/upgrades.ts content */
  upgrades: string;
  /** _internal/schema.ts content */
  internalSchema: string;
  /** _internal/upgradeFns.ts content */
  internalUpgradeFns: string;
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
  fields: Map<string, { derivedFrom: string[]; default?: unknown }>;
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
        { derivedFrom: string[]; default?: unknown }
      >();
      const recordUpgrades = currEntry.migrations?.[modelKey];
      for (const fieldKey of currFields) {
        if (!prevFields.has(fieldKey)) {
          const annotation = recordUpgrades?.[fieldKey];
          if (annotation != null) {
            addedFields.set(fieldKey, {
              derivedFrom: [...annotation.derivedFrom],
            });
          } else {
            addedFields.set(fieldKey, {
              derivedFrom: [],
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
 * Generate per-version internal interfaces (e.g. `ShapeBox__v1`, `ShapeBox__v2`).
 *
 * Each interface contains only the fields present in that version, with their
 * actual optionality taken straight from that version's IR. The downstream
 * `DocumentUpgradeFns` generator uses these so each upgrade function's
 * parameter can `Pick` the prior version's fields and its return type can
 * index the current version's field type precisely.
 */
function generatePerVersionInternalTypes(
  chain: VersionedIrEntry[],
): string {
  // Group by model so each model's versions appear together in ascending order.
  const perModelVersions = new Map<
    string,
    { version: number; fields: readonly IFieldDef[] }[]
  >();

  for (const { version, ir } of chain) {
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type !== "record") continue;
      let list = perModelVersions.get(modelKey);
      if (list == null) {
        list = [];
        perModelVersions.set(modelKey, list);
      }
      list.push({ version, fields: modelDef.record.fields });
    }
  }

  let output = "";
  const sortedModels = Array.from(perModelVersions.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [modelKey, versions] of sortedModels) {
    for (const { version, fields } of versions) {
      output += `/** Internal representation of ${modelKey} at schema version ${version}. */\n`;
      output += `export interface ${modelKey}__v${version} {\n`;
      const sortedFields = [...fields].sort((a, b) => a.key.localeCompare(b.key));
      for (const field of sortedFields) {
        const tsType = convertFieldTypeToInternalTypeScript(
          field.fieldType,
          field.isOptional === true,
        );
        const optional = field.isOptional === true ? "?" : "";
        output += `  readonly ${field.key}${optional}: ${tsType};\n`;
      }
      output += "}\n\n";
    }
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
 * Generate _internal/upgradeFns.ts content: a typed `DocumentUpgradeFns`
 * interface enumerating every upgrade function the app must supply at boot.
 *
 * For every `(modelName, stepName, fieldName)` triple where `derivedFrom` is
 * non-empty, emit a property typed
 * `(oldFields: Pick<<Model>__v<prior>, derivedFrom[number]>) => <Model>__v<current>[fieldName]`.
 * Additive fields (empty `derivedFrom`) are intentionally absent — they are
 * handled by the structural `default` in `_internal/upgrades.ts`.
 *
 * The interface is consumed by the generated `DocumentModel` factory in
 * `models.ts`, which requires it as a parameter when the schema has any
 * derived fields. Schemas without derived fields emit an empty interface
 * (still exported for type-uniformity in downstream code).
 */
function generateUpgradeFns(
  chain: VersionedIrEntry[],
  allRecordModels: Map<string, RecordModelInfo>,
): string {
  interface UpgradeFnEntry {
    fieldName: string;
    derivedFrom: readonly string[];
  }
  interface StepEntry {
    stepName: string;
    currentVersion: number;
    priorVersion: number;
    fields: UpgradeFnEntry[];
  }

  const perModel = new Map<string, StepEntry[]>();
  const neededTypes = new Set<string>();

  for (const [modelKey, model] of sortedEntries(allRecordModels)) {
    for (const step of model.steps) {
      const currentIdx = chain.findIndex(c => c.version === step.addedInVersion);
      if (currentIdx <= 0) continue;
      const priorVersion = chain[currentIdx - 1]!.version;

      const fields: UpgradeFnEntry[] = [];
      for (const [fieldName, fieldMeta] of step.fields) {
        if (fieldMeta.derivedFrom.length === 0) continue;
        fields.push({ fieldName, derivedFrom: [...fieldMeta.derivedFrom] });
      }
      if (fields.length === 0) continue;

      let list = perModel.get(modelKey);
      if (list == null) {
        list = [];
        perModel.set(modelKey, list);
      }
      list.push({
        stepName: step.name,
        currentVersion: step.addedInVersion,
        priorVersion,
        fields,
      });
      neededTypes.add(`${modelKey}__v${priorVersion}`);
      neededTypes.add(`${modelKey}__v${step.addedInVersion}`);
    }
  }

  let output = GENERATED_FILE_HEADER;
  output += `\n`;

  if (neededTypes.size > 0) {
    const sorted = Array.from(neededTypes).sort();
    output += `import type { ${sorted.join(", ")} } from "./types.js";\n\n`;
  }

  output += `/**\n`;
  output += ` * Typed upgrade functions the application must supply at boot. Coverage is\n`;
  output +=
    ` * exhaustive: missing or extra entries fail type-check at the \`DocumentModel(...)\`\n`;
  output += ` * call site. Additive fields (empty \`derivedFrom\`) are intentionally absent.\n`;
  output += ` */\n`;
  if (perModel.size === 0) {
    output += `// eslint-disable-next-line @typescript-eslint/no-empty-object-type\n`;
    output += `export interface DocumentUpgradeFns {}\n`;
  } else {
    output += `export interface DocumentUpgradeFns {\n`;
    for (
      const [modelKey, steps] of Array.from(perModel.entries()).sort(([a], [b]) =>
        a.localeCompare(b)
      )
    ) {
      output += `  ${modelKey}: {\n`;
      for (const step of steps) {
        output += `    ${step.stepName}: {\n`;
        for (const f of step.fields) {
          const pickKeys = f.derivedFrom.map(d => `"${d}"`).join(" | ");
          output +=
            `      ${f.fieldName}: (oldFields: Pick<${modelKey}__v${step.priorVersion}, ${pickKeys}>) => ${modelKey}__v${step.currentVersion}["${f.fieldName}"];\n`;
        }
        output += `    };\n`;
      }
      output += `  };\n`;
    }
    output += `}\n`;
  }

  return output;
}

/**
 * Generate _internal/types.ts, _internal/upgrades.ts, _internal/schema.ts and
 * _internal/upgradeFns.ts from an already-resolved versioned IR chain.
 */
export function generateInternalFromChain(
  resolved: ResolvedIrChain,
): InternalTypesOutput {
  const { chain } = resolved;
  const latestIr = chain[chain.length - 1]!.ir;

  const allRecordModels = collectRecordModels(chain);

  const internalTypes = generateInternalTypes(allRecordModels)
    + generatePerVersionInternalTypes(chain);
  const upgrades = generateUpgrades(allRecordModels, latestIr);
  const internalSchema = generateInternalSchemaContent(allRecordModels);
  const internalUpgradeFns = generateUpgradeFns(chain, allRecordModels);

  return { internalTypes, upgrades, internalSchema, internalUpgradeFns };
}
