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

import { describe, expect, it } from "vitest";
import type {
  IModelDef,
  IRealTimeDocumentSchema,
  IRecordDef,
  IUnionDef,
} from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { IFieldValueUnion } from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { convertIrToConjureSchema } from "../convertIrToConjureSchema.js";

function schemaWith(
  models: Record<string, IModelDef>,
  primaryModelKeys: string[] = [],
): IRealTimeDocumentSchema {
  return { name: "Test", description: "Test", version: 1, primaryModelKeys, models };
}

describe("convertIrToConjureSchema", () => {
  it("keeps record models nested under `record` (not flattened like the OSDK shape)", () => {
    const record: IRecordDef = {
      key: "Person",
      name: "Person",
      fields: [{
        key: "name",
        name: "Name",
        fieldType: { type: "value", value: IFieldValueUnion.string({}) },
        metadata: { addedInVersion: 1 },
      }],
    };

    const model = convertIrToConjureSchema(
      schemaWith({ Person: { type: "record", record } as IModelDef }, ["Person"]),
    ).models["Person"] as { type: string; record: IRecordDef };

    expect(model.type).toBe("record");
    expect(model.record.key).toBe("Person"); // nested, not { type: "record", key, name }
    expect(model.record.fields).toHaveLength(1);
  });

  it("keeps union models nested under `union`", () => {
    const union: IUnionDef = {
      key: "Shape",
      discriminant: "shapeType",
      name: "Shape",
      variants: { circle: "Circle" },
      metadata: { addedInVersion: 1 },
    };

    const model = convertIrToConjureSchema(
      schemaWith({ Shape: { type: "union", union } as IModelDef }, ["Shape"]),
    ).models["Shape"] as { type: string; union: IUnionDef };

    expect(model.type).toBe("union");
    expect(model.union.discriminant).toBe("shapeType");
    expect(model.union.variants).toEqual({ circle: "Circle" });
  });

  it("keeps a value field's union nested under its discriminant (no flattening)", () => {
    const record: IRecordDef = {
      key: "R",
      name: "R",
      fields: [{
        key: "f",
        name: "f",
        fieldType: { type: "value", value: IFieldValueUnion.string({ defaultValue: "abc" }) },
        metadata: { addedInVersion: 1 },
      }],
    };

    const model = convertIrToConjureSchema(
      schemaWith({ R: { type: "record", record } as IModelDef }),
    )
      .models["R"] as { record: { fields: Array<{ fieldType: unknown }> } };

    // Conjure: { type: "value", value: { type: "string", string: { defaultValue: "abc" } } }
    expect(model.record.fields[0]!.fieldType).toEqual({
      type: "value",
      value: { type: "string", string: { defaultValue: "abc" } },
    });
  });

  it("wraps collection element types in Conjure's FieldValueType", () => {
    const record: IRecordDef = {
      key: "R",
      name: "R",
      fields: [{
        key: "tags",
        name: "Tags",
        fieldType: {
          type: "array",
          array: { allowNullValue: false, value: IFieldValueUnion.string({}) },
        },
        metadata: { addedInVersion: 1 },
      }],
    };

    const model = convertIrToConjureSchema(
      schemaWith({ R: { type: "record", record } as IModelDef }),
    )
      .models["R"] as { record: { fields: Array<{ fieldType: unknown }> } };

    expect(model.record.fields[0]!.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: { valueType: { type: "string", string: {} } },
      },
    });
  });

  it("rejects the NaN sentinel in a double value", () => {
    const record: IRecordDef = {
      key: "R",
      name: "R",
      fields: [{
        key: "n",
        name: "N",
        fieldType: { type: "value", value: IFieldValueUnion.double({ defaultValue: "NaN" }) },
        metadata: { addedInVersion: 1 },
      }],
    };

    expect(() =>
      convertIrToConjureSchema(schemaWith({ R: { type: "record", record } as IModelDef }))
    )
      .toThrow(/NaN/);
  });

  it("returns empty models for an empty schema", () => {
    expect(convertIrToConjureSchema(schemaWith({}))).toEqual({ primaryModelKeys: [], models: {} });
  });
});
