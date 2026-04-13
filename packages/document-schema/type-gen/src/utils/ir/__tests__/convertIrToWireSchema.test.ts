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

import type { FieldValueType, RecordDef, UnionDef } from "@osdk/foundry.pack";
import { describe, expect, it } from "vitest";
import type {
  IModelDef,
  IRealTimeDocumentSchema,
  IRecordDef,
  IUnionDef,
} from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { IFieldValueUnion } from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { convertIrToWireSchema } from "../convertIrToWireSchema.js";

describe("convertIrToWireSchema", () => {
  it("should flatten record model and rename fields correctly", () => {
    const record: IRecordDef = {
      key: "Person",
      name: "Person",
      description: "A person",
      fields: [
        {
          key: "name",
          name: "Name",
          fieldType: {
            type: "value",
            value: IFieldValueUnion.string({}),
          },
          metadata: { addedInVersion: 1 },
        },
      ],
      metadata: { addedInVersion: 1 },
    };

    const ir: IRealTimeDocumentSchema = {
      name: "Test",
      description: "Test schema",
      version: 1,
      primaryModelKeys: ["Person"],
      models: {
        Person: { type: "record", record } as IModelDef,
      },
    };

    const wire = convertIrToWireSchema(ir);

    // Top-level structure
    expect(wire.primaryModelKeys).toEqual(["Person"]);
    expect(wire.models).toBeDefined();

    // Model is flattened (no .record wrapper)
    const personModel = wire.models["Person"];
    expect(personModel).toBeDefined();
    expect(personModel!.type).toBe("record");
    const person = personModel as { type: "record" } & RecordDef;
    expect(person.key).toBe("Person");
    expect(person.name).toBe("Person");
    expect("record" in person).toBe(false); // no conjure nesting

    // Field uses wire field names
    const nameField = person.fields[0]!;
    expect(nameField.key).toBe("name");
    expect(nameField.fieldType).toBeDefined();
    expect(nameField.metadata).toEqual({ addedInVersion: 1 });
  });

  it("should flatten union model", () => {
    const union: IUnionDef = {
      key: "Shape",
      discriminant: "shapeType",
      name: "Shape",
      variants: { circle: "Circle", square: "Square" },
      metadata: { addedInVersion: 1 },
    };

    const ir: IRealTimeDocumentSchema = {
      name: "Test",
      description: "Test",
      version: 1,
      primaryModelKeys: ["Shape"],
      models: {
        Shape: { type: "union", union } as IModelDef,
      },
    };

    const wire = convertIrToWireSchema(ir);
    const shapeModel = wire.models["Shape"];
    expect(shapeModel).toBeDefined();
    expect(shapeModel!.type).toBe("union");
    const shape = shapeModel as { type: "union" } & UnionDef;

    expect(shape.key).toBe("Shape");
    expect(shape.discriminant).toBe("shapeType");
    expect(shape.variants).toEqual({ circle: "Circle", square: "Square" });
    expect("union" in shape).toBe(false); // no conjure nesting
  });

  it("should convert value field type with FieldValueType wrapper", () => {
    const record: IRecordDef = {
      key: "R",
      name: "R",
      fields: [
        {
          key: "f",
          name: "f",
          fieldType: {
            type: "value",
            value: IFieldValueUnion.string({ defaultValue: "abc" }),
          },
          metadata: { addedInVersion: 1 },
        },
      ],
      metadata: { addedInVersion: 1 },
    };

    const ir: IRealTimeDocumentSchema = {
      name: "Test",
      description: "Test",
      version: 1,
      primaryModelKeys: ["R"],
      models: { R: { type: "record", record } as IModelDef },
    };

    const wire = convertIrToWireSchema(ir);
    expect(wire.models["R"]).toBeDefined();
    expect(wire.models["R"]!.type).toBe("record");
    const recordModel = wire.models["R"] as { type: "record" } & RecordDef;
    const field = recordModel.fields[0]!;

    // Wire format wraps in { valueType: { type: "string", defaultValue: "abc" } }
    expect(field.fieldType).toEqual({
      type: "value",
      valueType: {
        type: "string",
        defaultValue: "abc",
      },
    });
  });

  it("should convert array field type with FieldValueType wrapper on elements", () => {
    const record: IRecordDef = {
      key: "R",
      name: "R",
      fields: [
        {
          key: "tags",
          name: "Tags",
          fieldType: {
            type: "array",
            array: {
              allowNullValue: false,
              value: IFieldValueUnion.string({}),
            },
          },
          metadata: { addedInVersion: 1 },
        },
      ],
      metadata: { addedInVersion: 1 },
    };

    const ir: IRealTimeDocumentSchema = {
      name: "Test",
      description: "Test",
      version: 1,
      primaryModelKeys: ["R"],
      models: { R: { type: "record", record } as IModelDef },
    };

    const wire = convertIrToWireSchema(ir);
    expect(wire.models["R"]).toBeDefined();
    expect(wire.models["R"]!.type).toBe("record");
    const recordModel = wire.models["R"] as { type: "record" } & RecordDef;
    const field = recordModel.fields[0]!;

    expect(field.fieldType).toEqual({
      type: "array",
      allowNullValue: false,
      value: {
        valueType: {
          type: "string",
        },
      },
    });
  });

  it("should flatten all field value union variants", () => {
    const variants: Array<{
      fn: (payload: never) => IFieldValueUnion;
      type: string;
      payload: Record<string, unknown>;
    }> = [
      { fn: IFieldValueUnion.boolean, type: "boolean", payload: {} },
      { fn: IFieldValueUnion.datetime, type: "datetime", payload: {} },
      { fn: IFieldValueUnion.docRef, type: "docRef", payload: { documentTypeRids: ["rid1"] } },
      { fn: IFieldValueUnion.double, type: "double", payload: { minValue: 0, maxValue: 100 } },
      { fn: IFieldValueUnion.integer, type: "integer", payload: { defaultValue: 42 } },
      { fn: IFieldValueUnion.mediaRef, type: "mediaRef", payload: {} },
      { fn: IFieldValueUnion.modelRef, type: "modelRef", payload: { modelTypes: ["Foo"] } },
      {
        fn: IFieldValueUnion.object,
        type: "object",
        payload: { interfaceTypeRids: [], objectTypeRids: ["rid2"] },
      },
      { fn: IFieldValueUnion.string, type: "string", payload: { maxLength: 255 } },
      { fn: IFieldValueUnion.text, type: "text", payload: {} },
      { fn: IFieldValueUnion.unmanagedJson, type: "unmanagedJson", payload: {} },
      { fn: IFieldValueUnion.userRef, type: "userRef", payload: {} },
    ];

    for (const { fn, type, payload } of variants) {
      const record: IRecordDef = {
        key: "R",
        name: "R",
        fields: [
          {
            key: "f",
            name: "f",
            fieldType: {
              type: "value",
              value: fn(payload as never),
            },
            metadata: { addedInVersion: 1 },
          },
        ],
        metadata: { addedInVersion: 1 },
      };

      const ir: IRealTimeDocumentSchema = {
        name: "Test",
        description: "Test",
        version: 1,
        primaryModelKeys: ["R"],
        models: { R: { type: "record", record } as IModelDef },
      };

      const wire = convertIrToWireSchema(ir);
      expect(wire.models["R"]).toBeDefined();
      expect(wire.models["R"]!.type).toBe("record");
      const recordModel = wire.models["R"] as { type: "record" } & RecordDef;
      const fieldType = recordModel.fields[0]!.fieldType;
      expect(fieldType.type).toBe("value");
      const wireValue = (fieldType as { type: "value" } & FieldValueType).valueType;
      expect(wireValue.type).toBe(type);
      // no conjure nesting key
      expect((wireValue as unknown as Record<string, unknown>)[type]).toBeUndefined();
      // Payload fields should be at top level
      for (const [key, val] of Object.entries(payload)) {
        expect((wireValue as unknown as Record<string, unknown>)[key]).toEqual(val);
      }
    }
  });

  it("should strip name, description, version from output", () => {
    const ir: IRealTimeDocumentSchema = {
      name: "My Schema",
      description: "My description",
      version: 5,
      primaryModelKeys: [],
      models: {},
    };

    const wire = convertIrToWireSchema(ir);

    expect("name" in wire).toBe(false);
    expect("description" in wire).toBe(false);
    expect("version" in wire).toBe(false);
    expect(wire.primaryModelKeys).toEqual([]);
    expect(wire.models).toEqual({});
  });
});
