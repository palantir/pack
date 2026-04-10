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
  DocumentTypeSchema,
  FieldDef,
  FieldTypeUnion,
  FieldValueType,
  FieldValueUnion,
  ModelDef,
  SchemaMetadata,
} from "@osdk/foundry.pack";
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
  const wireModels: DocumentTypeSchema["models"] = {};

  for (const [key, model] of Object.entries(ir.models)) {
    wireModels[key] = convertModelDef(model);
  }

  return {
    primaryModelKeys: [...ir.primaryModelKeys],
    models: wireModels,
  };
}

function convertModelDef(model: IModelDef): ModelDef {
  switch (model.type) {
    case "record":
      return {
        type: "record",
        key: model.record.key,
        name: model.record.name,
        description: orUndefined(model.record.description),
        fields: [...model.record.fields.map(convertFieldDef)],
        metadata: convertSchemaMeta(model.record.metadata),
      };
    case "union":
      return {
        type: "union",
        key: model.union.key,
        discriminant: model.union.discriminant,
        name: model.union.name,
        description: orUndefined(model.union.description),
        variants: { ...model.union.variants },
        metadata: convertSchemaMeta(model.union.metadata),
      };
  }
}

function convertFieldDef(field: IFieldDef): FieldDef {
  return {
    key: field.key,
    name: field.name,
    description: orUndefined(field.description),
    isOptional: orUndefined(field.isOptional),
    fieldType: convertFieldTypeUnion(field.fieldType),
    metadata: convertSchemaMeta(field.metadata),
  };
}

function convertFieldTypeUnion(fieldType: IFieldTypeUnion): FieldTypeUnion {
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

function convertFieldValueType(value: IFieldValueUnion): FieldValueType {
  return {
    valueType: convertFieldValueUnion(value),
  };
}

function convertFieldValueUnion(value: IFieldValueUnion): FieldValueUnion {
  switch (value.type) {
    case "boolean":
      return { type: "boolean", defaultValue: orUndefined(value.boolean.defaultValue) };
    case "datetime":
      return { type: "datetime", value: value.datetime.value };
    case "docRef":
      return { type: "docRef", documentTypeRids: [...value.docRef.documentTypeRids] };
    case "double":
      return {
        type: "double",
        defaultValue: nanToNumber(orUndefined(value.double.defaultValue)),
        minValue: nanToNumber(orUndefined(value.double.minValue)),
        maxValue: nanToNumber(orUndefined(value.double.maxValue)),
      };
    case "integer":
      return {
        type: "integer",
        defaultValue: orUndefined(value.integer.defaultValue),
        minValue: orUndefined(value.integer.minValue),
        maxValue: orUndefined(value.integer.maxValue),
      };
    case "mediaRef":
      return { type: "mediaRef", value: value.mediaRef.value };
    case "modelRef":
      return { type: "modelRef", modelTypes: [...value.modelRef.modelTypes] };
    case "object":
      return {
        type: "object",
        interfaceTypeRids: [...value.object.interfaceTypeRids],
        objectTypeRids: [...value.object.objectTypeRids],
      };
    case "string":
      return {
        type: "string",
        defaultValue: orUndefined(value.string.defaultValue),
        minLength: orUndefined(value.string.minLength),
        maxLength: orUndefined(value.string.maxLength),
      };
    case "text":
      return {
        type: "text",
        defaultValue: orUndefined(value.text.defaultValue),
        minLength: orUndefined(value.text.minLength),
        maxLength: orUndefined(value.text.maxLength),
      };
    case "unmanagedJson":
      return { type: "unmanagedJson" };
    case "userRef":
      return { type: "userRef" };
  }
}

function convertSchemaMeta(meta: ISchemaMeta): SchemaMetadata {
  return {
    addedInVersion: meta.addedInVersion,
    deprecatedFromVersion: orUndefined(meta.deprecatedFromVersion),
    deprecatedMessage: orUndefined(meta.deprecatedMessage),
  };
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function nanToNumber(value: number | "NaN" | undefined): number | undefined {
  return value === "NaN" ? NaN : value;
}
