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
  IFieldValueUnion,
  IModelDef,
  IRealTimeDocumentSchema,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";

/**
 * Backpack's Conjure `DocumentTypeSchema` wire shape. We don't depend on the generated Conjure
 * client (it lives in an internal registry this public package can't use), so this is the structural
 * shape the publish endpoint expects; nested payloads are left as `unknown`.
 */
export interface ConjureDocumentTypeSchema {
  readonly primaryModelKeys: readonly string[];
  readonly models: Record<string, unknown>;
}

/**
 * Converts the IR schema to Backpack's Conjure wire format.
 *
 * Conjure nests a union's payload under a key matching the discriminant
 * (`{ type: "record", record: { ... } }`) — which is how the IR is already shaped, so this is
 * mostly a pass-through. The one real difference: Conjure models a collection's element type as
 * `FieldValueType { valueType }`, while the IR carries the value union directly, so those get wrapped.
 *
 * Do NOT use {@link convertIrToWireSchema} for Backpack: that flattens unions into the OSDK shape
 * (`{ type: "record", key, name, ... }`), which the Conjure endpoint rejects.
 *
 * TODO(follow-up): this parallels {@link convertIrToWireSchema}'s tree walk. Longer term the IR
 * generator could emit the Conjure shape directly, letting this converter be removed.
 */
export function convertIrToConjureSchema(ir: IRealTimeDocumentSchema): ConjureDocumentTypeSchema {
  const models: Record<string, unknown> = {};
  for (const [key, model] of Object.entries(ir.models)) {
    models[key] = convertModelDef(model);
  }
  return { primaryModelKeys: [...ir.primaryModelKeys], models };
}

function convertModelDef(model: IModelDef): unknown {
  switch (model.type) {
    case "record":
      return {
        type: "record",
        record: { ...model.record, fields: model.record.fields.map(convertFieldDef) },
      };
    case "union":
      return { type: "union", union: { ...model.union } };
    default: {
      const _exhaustive: never = model;
      throw new Error(`Unknown model type: ${(_exhaustive as IModelDef).type}`);
    }
  }
}

function convertFieldDef(field: IFieldDef): unknown {
  return { ...field, fieldType: convertFieldTypeUnion(field.fieldType) };
}

function convertFieldTypeUnion(fieldType: IFieldTypeUnion): unknown {
  switch (fieldType.type) {
    case "array":
      return {
        type: "array",
        array: {
          allowNullValue: fieldType.array.allowNullValue,
          value: toFieldValueType(fieldType.array.value),
        },
      };
    case "map":
      return {
        type: "map",
        map: {
          allowNullValue: fieldType.map.allowNullValue,
          key: toFieldValueType(fieldType.map.key),
          value: toFieldValueType(fieldType.map.value),
        },
      };
    case "set":
      return {
        type: "set",
        set: {
          allowNullValue: fieldType.set.allowNullValue,
          value: toFieldValueType(fieldType.set.value),
        },
      };
    // Conjure's `value` variant carries the value union directly (double values are NaN-guarded).
    case "value":
      return { type: "value", value: convertFieldValueUnion(fieldType.value) };
    default: {
      const _exhaustive: never = fieldType;
      throw new Error(`Unknown field type: ${(_exhaustive as IFieldTypeUnion).type}`);
    }
  }
}

/** Wraps a value union in Conjure's `FieldValueType`. */
function toFieldValueType(value: IFieldValueUnion): unknown {
  return { valueType: convertFieldValueUnion(value) };
}

/**
 * Value unions are already in the Conjure nested shape, so this is a pass-through — except doubles,
 * whose numeric fields may carry the "NaN" sentinel. Reject it early (matching
 * {@link convertIrToWireSchema}) rather than forward an invalid double to Backpack.
 */
function convertFieldValueUnion(value: IFieldValueUnion): unknown {
  if (value.type === "double") {
    return {
      type: "double",
      double: {
        ...value.double,
        defaultValue: rejectNaN(value.double.defaultValue),
        minValue: rejectNaN(value.double.minValue),
        maxValue: rejectNaN(value.double.maxValue),
      },
    };
  }
  return value;
}

function rejectNaN(value: number | "NaN" | null | undefined): number | undefined {
  if (value === "NaN") {
    throw new Error("NaN is not a valid double value for wire serialization");
  }
  return value ?? undefined;
}
