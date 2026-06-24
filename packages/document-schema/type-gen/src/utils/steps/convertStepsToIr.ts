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

import type * as P from "@palantir/pack.schema";
import invariant from "tiny-invariant";
import type {
  IModelTypeKey,
  IUnionVariantKey,
} from "../../lib/pack-docschema-api/pack-docschema-api";
import type {
  IFieldDef,
  IRealTimeDocumentSchema,
  IRecordDef,
  IUnionDef,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import {
  IFieldTypeUnion,
  IFieldValueUnion,
  IModelDef,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { assertNever } from "../assertNever.js";
import { convertStepsToSchema } from "./convertStepsToSchema.js";
import type { MigrationStep } from "./parseMigrationSteps.js";

export interface SchemaMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly version?: number;
}

/**
 * Per-field version provenance for a schema, keyed by model export key then
 * field name. Supplied by the version-aware caller (`resolveSchemaChain`) so the
 * IR records the version each field first appeared in (and any deprecation)
 * instead of a placeholder. When omitted, fields fall back to the schema's
 * top-level version (correct for single-version / steps-based callers).
 */
export interface SchemaProvenance {
  readonly fieldVersions?: Record<string, Record<string, number>>;
  readonly modelVersions?: Record<string, number>;
  readonly deprecations?: P.VersionDeprecations;
}

/**
 * Converts migration steps to Palantir IR format
 */
export function convertStepsToIr(
  steps: readonly MigrationStep[],
  metadata?: SchemaMetadata,
): IRealTimeDocumentSchema {
  // First convert steps to document-schema-api format
  const { recordDefinitions, unionDefinitions } = convertStepsToSchema(steps as MigrationStep[]);

  const schema = {
    ...Object.fromEntries(recordDefinitions.map(def => [def.name, def])),
    ...Object.fromEntries(unionDefinitions.map(def => [def.name, def])),
  };

  return convertSchemaToIr(schema, metadata);
}

/**
 * Converts record and union definitions to Palantir IR format. When
 * `provenance` is supplied (by the version-aware caller), each field/model is
 * stamped with the version it first appeared in and any deprecation; otherwise
 * everything falls back to `metadata.version` (default 1).
 */
export function convertSchemaToIr(
  inputSchema: P.ModelDefs,
  metadata?: SchemaMetadata,
  provenance?: SchemaProvenance,
): IRealTimeDocumentSchema {
  // Build a mapping from declared model name → export key so that union variant
  // refs (which use declared model names) can be remapped to export keys.
  const nameToExportKey = new Map<string, string>();
  for (const [exportKey, modelDef] of Object.entries(inputSchema)) {
    const existing = nameToExportKey.get(modelDef.name);
    invariant(
      existing == null,
      `Duplicate declared model name "${modelDef.name}": exported as both "${existing}" and "${exportKey}"`,
    );
    nameToExportKey.set(modelDef.name, exportKey);
  }
  const fallbackVersion = metadata?.version ?? 1;

  const primaryModelKeys: IModelTypeKey[] = [];
  const models = new Map<IModelTypeKey, IModelDef>();

  for (const [exportKey, modelDef] of Object.entries(inputSchema)) {
    if (collectModels(exportKey, modelDef, nameToExportKey, models, fallbackVersion, provenance)) {
      primaryModelKeys.push(exportKey);
    }
  }

  return {
    name: metadata?.name ?? "Generated Schema",
    description: metadata?.description ?? "Schema generated from migration steps",
    version: fallbackVersion,
    primaryModelKeys,
    models: Object.fromEntries(models),
  };
}

function collectModels(
  exportKey: string,
  modelDef: P.ModelDef,
  nameToExportKey: Map<string, string>,
  outModels: Map<IModelTypeKey, IModelDef>,
  fallbackVersion: number,
  provenance?: SchemaProvenance,
): boolean {
  invariant(
    !outModels.has(exportKey),
    `Duplicate model definition: ${exportKey}`,
  );

  switch (modelDef.type) {
    case "record": {
      outModels.set(
        exportKey,
        IModelDef.record(
          convertRecordDefToIr(modelDef, exportKey, nameToExportKey, fallbackVersion, provenance),
        ),
      );
      return true;
    }
    case "union": {
      outModels.set(
        exportKey,
        IModelDef.union(
          convertUnionDefToIr(modelDef, exportKey, nameToExportKey, fallbackVersion, provenance),
        ),
      );
      return true;
    }
    default:
      assertNever(modelDef);
  }
}

export function convertRecordDefToIr(
  recordDef: P.RecordDef,
  exportKey?: string,
  nameToExportKey?: Map<string, string>,
  fallbackVersion: number = 1,
  provenance?: SchemaProvenance,
): IRecordDef {
  const modelKey = exportKey ?? recordDef.name;
  const fieldVersions = provenance?.fieldVersions?.[modelKey];
  const deprecations = provenance?.deprecations?.[modelKey];
  const fields = Object.entries(recordDef.fields).map(([fieldKey, fieldType]): IFieldDef => {
    const dep = deprecations?.[fieldKey];
    return {
      key: fieldKey,
      name: fieldKey,
      description: undefined,
      fieldType: convertTypeToFieldTypeUnion(fieldType, nameToExportKey),
      metadata: {
        addedInVersion: fieldVersions?.[fieldKey] ?? fallbackVersion,
        ...(dep != null
          ? {
            deprecatedFromVersion: dep.fromVersion,
            ...(dep.message != null ? { deprecatedMessage: dep.message } : {}),
          }
          : {}),
      },
      isOptional: fieldType.type === "optional" ? true : undefined,
    };
  });

  return {
    key: modelKey,
    name: recordDef.name,
    description: recordDef.docs ?? undefined,
    fields,
  };
}

export function convertUnionDefToIr(
  unionDef: P.UnionDef,
  exportKey?: string,
  nameToExportKey?: Map<string, string>,
  fallbackVersion: number = 1,
  provenance?: SchemaProvenance,
): IUnionDef {
  const modelKey = exportKey ?? unionDef.name;
  const variantEntries = Object.entries(unionDef.variants).map((
    [variantName, modelRef],
  ) =>
    [
      variantName as IUnionVariantKey,
      (nameToExportKey?.get(modelRef.name) ?? modelRef.name) as IModelTypeKey,
    ] as const
  );

  const unionAddedIn = provenance?.modelVersions?.[modelKey] ?? fallbackVersion;

  return {
    key: modelKey,
    name: unionDef.name,
    description: unionDef.docs,
    discriminant: unionDef.discriminant,
    variants: Object.fromEntries(variantEntries),
    metadata: { addedInVersion: unionAddedIn },
  };
}

// TODO: rename to convertSchemaTypeToFieldTypeUnion
export function convertTypeToFieldTypeUnion(
  schemaType: P.Type,
  nameToExportKey?: Map<string, string>,
): IFieldTypeUnion {
  switch (schemaType.type) {
    case "array": {
      // P.Array.items is typed as TypeBase due to the generic; narrow via type field
      const items = schemaType.items as P.Type;
      const allowNullValue = items.type === "optional";
      const elementType: P.Type = allowNullValue ? (items as P.Optional).item as P.Type : items;
      return IFieldTypeUnion.array({
        allowNullValue,
        value: convertTypeToFieldValueUnion(elementType, nameToExportKey),
      });
    }

    case "optional":
      // Optional flag is handled at field level; unwrap and recurse on inner type
      return convertTypeToFieldTypeUnion(schemaType.item as P.Type, nameToExportKey);

    case "boolean":
    case "docRef":
    case "double":
    case "mediaRef":
    case "objectRef":
    case "ref":
    case "string":
    case "unknown":
    case "userRef":
      return IFieldTypeUnion.value(convertTypeToFieldValueUnion(schemaType, nameToExportKey));

    default:
      assertNever(schemaType);
  }
}

function convertTypeToFieldValueUnion(
  schemaType: P.Type,
  nameToExportKey?: Map<string, string>,
): IFieldValueUnion {
  switch (schemaType.type) {
    case "array":
      throw new Error(
        "Nested arrays are not supported in the IR. "
          + "Wrap the inner array in a record instead.",
      );

    case "boolean":
      return IFieldValueUnion.boolean({});

    case "docRef":
      return IFieldValueUnion.docRef({
        documentTypeRids: [], // FIXME: confirm whether we will use rids in the deployed schema.
      });

    case "double":
      return IFieldValueUnion.double({});

    case "mediaRef":
      return IFieldValueUnion.mediaRef({});

    case "objectRef":
      return IFieldValueUnion.object({
        // FIXME: confirm whether we will use rids in the deployed schema.
        interfaceTypeRids: [],
        objectTypeRids: [],
      });

    case "optional":
      // Nested optional — unwrap and continue
      // TODO: probably warn? maybe throw
      return convertTypeToFieldValueUnion(schemaType.item as P.Type, nameToExportKey);

    case "ref": {
      const modelKey = nameToExportKey?.get(schemaType.name) ?? schemaType.name;
      return IFieldValueUnion.modelRef({ modelTypes: [modelKey as IModelTypeKey] });
    }

    case "string":
      return IFieldValueUnion.string({});

    case "unknown":
      return IFieldValueUnion.unmanagedJson({});

    case "userRef":
      return IFieldValueUnion.userRef({});

    default:
      assertNever(schemaType);
  }
}
