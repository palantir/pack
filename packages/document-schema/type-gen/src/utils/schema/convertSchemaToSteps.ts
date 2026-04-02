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

import type {
  FieldMigrationMetadata,
  VersionedSchema,
  VersionedSchemaMetadata,
} from "@palantir/pack.schema";
import { SchemaVersionMetadata } from "@palantir/pack.schema";
import yaml from "js-yaml";
import type {
  MigrationStep,
  RecordFieldDefinition,
  UnionDefinition,
} from "../steps/parseMigrationSteps.js";
import type { P } from "./validateSchemaModule.js";

function convertFieldType(field: P.Type): string {
  switch (field.type) {
    case "array":
      return `array<${convertFieldType(field.items as P.Type)}>`;
    case "boolean":
      return "boolean";
    case "docRef":
      return "docRef";
    case "double":
      return "double";
    case "mediaRef":
      return "mediaRef";
    case "objectRef":
      return "objectRef";
    case "optional":
      return `optional<${convertFieldType(field.item as P.Type)}>`;
    case "ref":
      return field.name;
    case "string":
      return "string";
    case "unknown":
      return "unknown";
    case "userRef":
      return "userRef";
    default:
      field satisfies never;
      throw new Error(`Unsupported field type: ${(field as P.Type).type}`);
  }
}

function convertRecordToYaml(
  recordDef: P.RecordDef,
): { docs?: string; fields: Record<string, RecordFieldDefinition> } {
  const result: { docs?: string; fields: Record<string, RecordFieldDefinition> } = {
    fields: {},
  };

  if (recordDef.docs) {
    result.docs = recordDef.docs;
  }

  for (const [fieldName, fieldDef] of Object.entries(recordDef.fields)) {
    const fieldType = convertFieldType(fieldDef);

    // Check for migration metadata on this field
    const migration = recordDef.fieldMigrations?.[fieldName];
    if (migration != null && hasMigrationInfo(migration)) {
      result.fields[fieldName] = convertFieldWithMigration(fieldType, migration);
    } else {
      result.fields[fieldName] = fieldType;
    }
  }

  return result;
}

function hasMigrationInfo(meta: FieldMigrationMetadata): boolean {
  return meta.derivedFrom.length > 0 || meta.default !== undefined;
}

function convertFieldWithMigration(
  fieldType: string,
  migration: FieldMigrationMetadata,
): RecordFieldDefinition {
  const result: { type: string; "derived-from"?: string[]; "default"?: unknown } = {
    type: fieldType,
  };

  if (migration.derivedFrom.length > 0) {
    result["derived-from"] = [...migration.derivedFrom];
  }
  if (migration.default !== undefined) {
    result["default"] = migration.default;
  }

  return result;
}

function convertUnionToYaml(unionDef: P.UnionDef): UnionDefinition {
  const variants: Record<string, string> = {};

  for (const [variantName, variantRef] of Object.entries(unionDef.variants)) {
    variants[variantName] = variantRef.name;
  }

  const result: UnionDefinition = {
    variants,
  };

  if (unionDef.discriminant !== "type") {
    result.discriminant = unionDef.discriminant;
  }

  return result;
}

/**
 * Convert a plain ReturnedSchema to migration steps (existing behavior).
 */
export function convertSchemaToSteps(schema: P.ReturnedSchema): MigrationStep[] {
  const steps: MigrationStep[] = [];
  const records: Record<string, { docs?: string; fields: Record<string, RecordFieldDefinition> }> =
    {};
  const unions: Record<string, UnionDefinition> = {};

  for (const def of Object.values(schema)) {
    switch (def.type) {
      case "record": {
        records[def.name] = convertRecordToYaml(def);
        break;
      }
      case "union": {
        unions[def.name] = convertUnionToYaml(def);
        break;
      }
    }
  }

  if (Object.keys(records).length > 0) {
    steps.push({ "add-records": records });
  }

  if (Object.keys(unions).length > 0) {
    steps.push({ "add-union": unions });
  }

  return steps;
}

// --- Versioned schema support ---

export interface BaselineStep {
  version: 0;
  "add-records"?: Record<string, { docs?: string; fields: Record<string, RecordFieldDefinition> }>;
  "add-union"?: Record<string, UnionDefinition>;
}

export interface VersionStep {
  version: number;
  "schema-updates": SchemaUpdateYaml[];
  "removed-fields"?: Record<string, string[]>;
}

export type VersionedMigrationStep = BaselineStep | VersionStep;

interface SchemaUpdateYaml {
  name: string;
  stage: string;
  "modify-records"?: Record<string, {
    "add-fields"?: Record<string, RecordFieldDefinition>;
  }>;
  "remove-fields"?: Record<string, string[]>;
}

/**
 * Convert a VersionedSchema to versioned migration steps.
 * Produces one step per version: the baseline (add-records/add-union) plus
 * per-version schema update entries with migration metadata.
 */
export function convertVersionedSchemaToSteps(
  versionedSchema: VersionedSchema,
): VersionedMigrationStep[] {
  const metadata = versionedSchema[SchemaVersionMetadata];
  const schema = versionedSchema.schema;

  // Collect baseline: records and unions without migration metadata
  const baselineStep = buildBaselineStep(schema, metadata);
  const steps: VersionedMigrationStep[] = [baselineStep];

  // Build version steps from metadata history + current.
  // Only emit updates that are new or advancing in each version (not carried-forward).
  const allVersions = [...metadata.history, metadata];
  let previousUpdates: ReadonlyArray<{ name: string; stage: string }> = [];
  for (const versionMeta of allVersions) {
    const versionStep = buildVersionStep(schema, versionMeta, previousUpdates);
    if (versionStep != null) {
      steps.push(versionStep);
    }
    previousUpdates = versionMeta.updates;
  }

  return steps;
}

function buildBaselineStep(
  schema: P.ReturnedSchema,
  _metadata: VersionedSchemaMetadata,
): BaselineStep {
  // Baseline includes all records/unions with their base fields (no migration-added fields)
  const records: Record<string, { docs?: string; fields: Record<string, RecordFieldDefinition> }> =
    {};
  const unions: Record<string, UnionDefinition> = {};

  for (const def of Object.values(schema)) {
    switch (def.type) {
      case "record": {
        // Emit base fields only (exclude fields with migration metadata)
        const baseFields: Record<string, RecordFieldDefinition> = {};
        for (const [fieldName, fieldDef] of Object.entries(def.fields)) {
          if (def.fieldMigrations?.[fieldName] == null) {
            baseFields[fieldName] = convertFieldType(fieldDef);
          }
        }

        if (Object.keys(baseFields).length > 0 || !def.fieldMigrations) {
          records[def.name] = {
            ...(def.docs ? { docs: def.docs } : {}),
            fields: baseFields,
          };
        }
        break;
      }
      case "union": {
        unions[def.name] = convertUnionToYaml(def);
        break;
      }
    }
  }

  const step: BaselineStep = { version: 0 };
  if (Object.keys(records).length > 0) {
    step["add-records"] = records;
  }
  if (Object.keys(unions).length > 0) {
    step["add-union"] = unions;
  }
  return step;
}

function buildVersionStep(
  schema: P.ReturnedSchema,
  versionMeta: VersionedSchemaMetadata,
  previousUpdates: ReadonlyArray<{ name: string; stage: string }>,
): VersionStep | undefined {
  const schemaUpdates: SchemaUpdateYaml[] = [];

  // Only emit updates that are new or have advanced stage since the previous version
  const prevByName = new Map(previousUpdates.map(u => [u.name, u.stage]));
  for (const update of versionMeta.updates) {
    const prevStage = prevByName.get(update.name);
    if (prevStage === update.stage) continue; // carried forward unchanged, skip

    const updateYaml = buildSchemaUpdateYaml(schema, update);
    if (updateYaml != null) {
      schemaUpdates.push(updateYaml);
    }
  }

  if (schemaUpdates.length === 0) return undefined;

  return {
    version: versionMeta.version,
    "schema-updates": schemaUpdates,
  };
}

function buildSchemaUpdateYaml(
  schema: P.ReturnedSchema,
  update: VersionedSchemaMetadata["updates"][number],
): SchemaUpdateYaml | undefined {
  const modifyRecords: Record<string, { "add-fields"?: Record<string, RecordFieldDefinition> }> =
    {};
  const removeFields: Record<string, string[]> = {};

  // Walk all records in the schema to find fields associated with this update
  // We identify them by matching migration metadata
  for (const def of Object.values(schema)) {
    if (def.type !== "record") continue;
    const recordDef = def as P.RecordDef;

    // Find migration-added fields belonging to this specific update
    if (recordDef.fieldMigrations) {
      const addFields: Record<string, RecordFieldDefinition> = {};
      for (const [fieldName, migration] of Object.entries(recordDef.fieldMigrations)) {
        if (migration.updateName !== update.name) continue;
        const fieldDef = recordDef.fields[fieldName];
        if (fieldDef == null) continue;
        const fieldType = convertFieldType(fieldDef);
        addFields[fieldName] = convertFieldWithMigration(fieldType, migration);
      }
      if (Object.keys(addFields).length > 0) {
        modifyRecords[recordDef.name] = { "add-fields": addFields };
      }
    }

    // Find removed fields
    if (recordDef.removedFields && recordDef.removedFields.length > 0) {
      removeFields[recordDef.name] = [...recordDef.removedFields];
    }
  }

  const hasModify = Object.keys(modifyRecords).length > 0;
  const hasRemove = Object.keys(removeFields).length > 0;
  if (!hasModify && !hasRemove) return undefined;

  const result: SchemaUpdateYaml = {
    name: update.name,
    stage: update.stage,
  };
  if (hasModify) {
    result["modify-records"] = modifyRecords;
  }
  if (hasRemove) {
    result["remove-fields"] = removeFields;
  }
  return result;
}

export function convertStepsToYamlString(
  steps: MigrationStep[] | VersionedMigrationStep[],
): string {
  return yaml.dump(steps, {
    flowLevel: -1,
    lineWidth: -1,
    noRefs: true,
    quotingType: "'",
    forceQuotes: false,
    skipInvalid: false,
  });
}
