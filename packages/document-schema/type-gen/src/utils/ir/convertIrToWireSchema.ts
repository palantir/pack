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

import type { DocumentTypeSchema } from "@osdk/foundry.pack";
import type {
  IFieldDef,
  IFieldTypeUnion,
  IFieldValueUnion,
  IModelDef,
  IRealTimeDocumentSchema,
  ISchemaMeta,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";

/**
 * Converts the internal IR schema to the wire format expected by the Foundry API.
 *
 * The IR uses conjure-style tagged unions where the payload is nested under a key
 * matching the discriminant (e.g. `{ type: "record", record: { ... } }`).
 *
 * The Foundry API (DocumentTypeSchema from @osdk/foundry.pack) uses flat discriminated
 * unions where payload fields are spread alongside the type discriminant
 * (e.g. `{ type: "record", key: "...", name: "...", ... }`).
 *
 * This function performs that structural conversion. Field names already match between
 * the IR and wire format.
 */
export function convertIrToWireSchema(ir: IRealTimeDocumentSchema): DocumentTypeSchema {
  const wireModels: Record<string, unknown> = {};

  for (const [key, model] of Object.entries(ir.models)) {
    wireModels[key] = convertModelDef(model);
  }

  return {
    primaryModelKeys: [...ir.primaryModelKeys],
    models: wireModels as DocumentTypeSchema["models"],
  };
}

function convertModelDef(model: IModelDef): unknown {
  switch (model.type) {
    case "record":
      return {
        type: "record",
        key: model.record.key,
        name: model.record.name,
        description: model.record.description,
        fields: model.record.fields.map(convertFieldDef),
        metadata: convertSchemaMeta(model.record.metadata),
      };
    case "union":
      return {
        type: "union",
        key: model.union.key,
        discriminant: model.union.discriminant,
        name: model.union.name,
        description: model.union.description,
        variants: { ...model.union.variants },
        metadata: convertSchemaMeta(model.union.metadata),
      };
  }
}

function convertFieldDef(field: IFieldDef): unknown {
  return {
    key: field.key,
    name: field.name,
    description: field.description,
    isOptional: field.isOptional,
    fieldType: convertFieldTypeUnion(field.fieldType),
    metadata: convertSchemaMeta(field.metadata),
  };
}

function convertFieldTypeUnion(fieldType: IFieldTypeUnion): unknown {
  switch (fieldType.type) {
    case "array":
      return {
        type: "array",
        allowNullValue: fieldType.array.allowNullValue,
        value: convertFieldValueType(fieldType.array.value),
      };
    case "map":
      return {
        type: "map",
        allowNullValue: fieldType.map.allowNullValue,
        key: convertFieldValueType(fieldType.map.key),
        value: convertFieldValueType(fieldType.map.value),
      };
    case "set":
      return {
        type: "set",
        allowNullValue: fieldType.set.allowNullValue,
        value: convertFieldValueType(fieldType.set.value),
      };
    case "value":
      return {
        type: "value",
        valueType: convertFieldValueUnion(fieldType.value),
      };
  }
}

/**
 * Wraps a field value union in the FieldValueType wrapper expected by the wire format.
 * Wire format: `{ valueType: { type: "string", ... } }`
 */
function convertFieldValueType(value: IFieldValueUnion): unknown {
  return {
    valueType: convertFieldValueUnion(value),
  };
}

/**
 * Converts a conjure-tagged field value union to a flat discriminated union.
 * IR: `{ type: "string", string: { defaultValue: "abc" } }`
 * Wire: `{ type: "string", defaultValue: "abc" }`
 */
function convertFieldValueUnion(value: IFieldValueUnion): unknown {
  switch (value.type) {
    case "boolean":
      return { type: "boolean", ...value.boolean };
    case "datetime":
      return { type: "datetime", ...value.datetime };
    case "docRef":
      return { type: "docRef", ...value.docRef };
    case "double":
      return { type: "double", ...value.double };
    case "integer":
      return { type: "integer", ...value.integer };
    case "mediaRef":
      return { type: "mediaRef", ...value.mediaRef };
    case "modelRef":
      return { type: "modelRef", ...value.modelRef };
    case "object":
      return { type: "object", ...value.object };
    case "string":
      return { type: "string", ...value.string };
    case "text":
      return { type: "text", ...value.text };
    case "unmanagedJson":
      return { type: "unmanagedJson", ...value.unmanagedJson };
    case "userRef":
      return { type: "userRef", ...value.userRef };
  }
}

function convertSchemaMeta(meta: ISchemaMeta): unknown {
  return {
    addedInVersion: meta.addedInVersion,
    deprecatedFromVersion: meta.deprecatedFromVersion,
    deprecatedMessage: meta.deprecatedMessage,
  };
}
