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
import {
  chainNeedsUpgradeFns,
  type ResolvedIrChain,
  type VersionedIrEntry,
} from "./resolveSchemaChain.js";

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
 *
 * `fields` only contains entries that require lens treatment — derived fields
 * (`derivedFrom.length > 0`) and required additive fields (`derivedFrom.length
 * === 0 && !isOptional`). Optional additive fields are absent because
 * `undefined` is a legal value at the current version and the lens has no
 * work to do.
 */
interface UpgradeStep {
  addedInVersion: number;
  fields: Map<string, { derivedFrom: string[]; isOptional: boolean }>;
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

      // Fields added in this version that require lens treatment. Optional
      // additive fields are skipped — `undefined` is a legal v_current value
      // for them, so the lens has nothing to invent.
      const addedFields = new Map<
        string,
        { derivedFrom: string[]; isOptional: boolean }
      >();
      const recordUpgrades = currEntry.migrations?.[modelKey];
      for (const field of currModelDef.record.fields) {
        const fieldKey = field.key;
        if (prevFields.has(fieldKey)) continue;
        const isOptional = field.isOptional === true;
        const annotation = recordUpgrades?.[fieldKey];
        const derivedFrom = annotation != null ? [...annotation.derivedFrom] : [];
        if (derivedFrom.length === 0 && isOptional) continue;
        addedFields.set(fieldKey, { derivedFrom, isOptional });
      }

      // Fields absent from this version relative to the previous one (i.e. deprecated fields).
      const removedFields: string[] = [];
      for (const fieldKey of prevFields) {
        if (!currFields.has(fieldKey)) {
          removedFields.push(fieldKey);
        }
      }

      if (addedFields.size > 0 || removedFields.length > 0) {
        model.steps.push({
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
      output += `      addedInVersion: ${step.addedInVersion},\n`;
      output += `      fields: {\n`;
      for (const [fieldName, fieldMeta] of step.fields) {
        output += `        ${fieldName}: {\n`;
        output += `          derivedFrom: [${
          fieldMeta.derivedFrom.map(d => `"${d}"`).join(", ")
        }],\n`;
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
 * For each `(modelName, v${version}, fieldName)` triple in a step's `fields`,
 * emit one property:
 *  - Derived (`derivedFrom.length > 0`):
 *    `(oldFields: Pick<<Model>__v<prior>, derivedFrom[number]>) => <Model>__v<current>[fieldName]`.
 *  - Required additive (`derivedFrom.length === 0`):
 *    `() => <Model>__v<current>[fieldName]`.
 *
 * Optional additive fields are filtered out at step-collection time and don't
 * appear here — `undefined` is a legal v<current> value for them, so the app
 * has no obligation to invent one.
 *
 * The interface is consumed by the generated `DocumentModel` factory in
 * `models.ts`, which requires it as a parameter when the schema needs any
 * upgrade functions. Schemas with no required fields added past v1 emit an
 * empty interface (still exported for type-uniformity in downstream code).
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
        fields.push({ fieldName, derivedFrom: [...fieldMeta.derivedFrom] });
      }
      if (fields.length === 0) continue;

      let list = perModel.get(modelKey);
      if (list == null) {
        list = [];
        perModel.set(modelKey, list);
      }
      list.push({
        currentVersion: step.addedInVersion,
        priorVersion,
        fields,
      });
      // Prior-version type only needed when at least one field derives from it.
      if (fields.some(f => f.derivedFrom.length > 0)) {
        neededTypes.add(`${modelKey}__v${priorVersion}`);
      }
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
  output += ` * call site. Derived fields receive their declared source fields; required\n`;
  output += ` * additive fields receive no arguments. Optional additive fields are absent\n`;
  output += ` * — \`undefined\` is a legal value at the new version, so the runtime lens\n`;
  output += ` * leaves them alone.\n`;
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
        output += `    v${step.currentVersion}: {\n`;
        for (const f of step.fields) {
          const returnType = `${modelKey}__v${step.currentVersion}["${f.fieldName}"]`;
          if (f.derivedFrom.length === 0) {
            output += `      ${f.fieldName}: () => ${returnType};\n`;
          } else {
            const pickKeys = f.derivedFrom.map(d => `"${d}"`).join(" | ");
            output +=
              `      ${f.fieldName}: (oldFields: Pick<${modelKey}__v${step.priorVersion}, ${pickKeys}>) => ${returnType};\n`;
          }
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
    + (chainNeedsUpgradeFns(chain) ? generatePerVersionInternalTypes(chain) : "");
  const upgrades = generateUpgrades(allRecordModels, latestIr);
  const internalSchema = generateInternalSchemaContent(allRecordModels);
  const internalUpgradeFns = generateUpgradeFns(chain, allRecordModels);

  return { internalTypes, upgrades, internalSchema, internalUpgradeFns };
}
