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

import { defineRecord, defineUnion } from "@palantir/pack.schema";
import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import type { IFieldTypeUnion } from "../../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { convertSchemaToIr, convertStepsToIr } from "../convertStepsToIr.js";
import type { MigrationStep } from "../parseMigrationSteps.js";
import { parseMigrationSteps } from "../parseMigrationSteps.js";

describe("convertStepsToIr", () => {
  it("should convert simple record types to IR format", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          Person: {
            docs: "A person record",
            fields: {
              name: "string",
              age: "double",
              email: "optional<string>",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);

    expect(schema.name).toBe("Generated Schema");
    expect(schema.description).toBe("Schema generated from migration steps");
    expect(schema.version).toBe(1);
    expect(schema.primaryModelKeys).toEqual(["Person"]);
    expect(Object.keys(schema.models)).toHaveLength(1);

    const personModel = schema.models["Person"];
    expect(personModel).toBeDefined();
    expect(personModel?.type).toBe("record");
    if (personModel?.type !== "record") throw new Error("Expected record type");
    const personRecord = personModel.record;

    expect(personRecord.key).toBe("Person");
    expect(personRecord.name).toBe("Person");
    expect(personRecord.description).toBe("A person record");
    expect(personRecord.fields).toHaveLength(3);

    // Check name field
    const nameField = personRecord.fields.find(f => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField?.isOptional).toBeUndefined();
    expect(nameField?.fieldType).toEqual({
      type: "value",
      value: {
        type: "string",
        string: {},
      },
    });

    // Check age field
    const ageField = personRecord.fields.find(f => f.key === "age");
    expect(ageField).toBeDefined();
    expect(ageField?.fieldType).toEqual({
      type: "value",
      value: {
        type: "double",
        double: {},
      },
    });

    // Check optional email field
    const emailField = personRecord.fields.find(f => f.key === "email");
    expect(emailField).toBeDefined();
    expect(emailField?.isOptional).toBe(true);
    expect(emailField?.fieldType).toEqual({
      type: "value",
      value: {
        type: "string",
        string: {},
      },
    });
  });

  it("should convert array and list types to IR format", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          Container: {
            docs: "A container with collections",
            fields: {
              tags: "array<string>",
              numbers: "list<double>",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const containerModel = schema.models["Container"];
    expect(containerModel).toBeDefined();
    expect(containerModel?.type).toBe("record");
    if (containerModel?.type !== "record") throw new Error("Expected record type");
    const containerRecord = containerModel.record;

    // Check tags array field
    const tagsField = containerRecord.fields.find(f => f.key === "tags");
    expect(tagsField?.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: {
          type: "string",
          string: {},
        },
      },
    });

    // Check numbers list field (treated as array)
    const numbersField = containerRecord.fields.find(f => f.key === "numbers");
    expect(numbersField?.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: {
          type: "double",
          double: {},
        },
      },
    });
  });

  it("should convert record references to IR format", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          Address: {
            fields: {
              street: "string",
              city: "string",
            },
          },
          Person: {
            fields: {
              name: "string",
              address: "Address",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const personModel = schema.models["Person"];
    expect(personModel).toBeDefined();
    expect(personModel?.type).toBe("record");
    if (personModel?.type !== "record") throw new Error("Expected record type");
    const personRecord = personModel.record;

    const addressField = personRecord.fields.find(f => f.key === "address");
    expect(addressField?.fieldType).toEqual(
      {
        type: "value",
        value: {
          type: "modelRef",
          modelRef: {
            modelTypes: ["Address"],
          },
        },
      } satisfies IFieldTypeUnion,
    );
  });

  it("should handle local fragments and extends", () => {
    const steps: MigrationStep[] = [
      {
        "local-fragment": {
          position: {
            x: "double",
            y: "double",
          },
        },
      },
      {
        "add-records": {
          ObjectNode: {
            docs: "A node with position",
            extends: ["position"],
            fields: {
              label: "string",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const objectNodeModel = schema.models["ObjectNode"];
    expect(objectNodeModel).toBeDefined();
    expect(objectNodeModel?.type).toBe("record");
    if (objectNodeModel?.type !== "record") throw new Error("Expected record type");
    const objectNode = objectNodeModel.record;

    expect(objectNode.fields).toHaveLength(3);

    // Check inherited fields from fragment
    const xField = objectNode.fields.find(f => f.key === "x");
    expect(xField).toBeDefined();
    expect(xField?.fieldType).toEqual({
      type: "value",
      value: {
        type: "double",
        double: {},
      },
    });

    const yField = objectNode.fields.find(f => f.key === "y");
    expect(yField).toBeDefined();

    // Check own field
    const labelField = objectNode.fields.find(f => f.key === "label");
    expect(labelField).toBeDefined();
  });

  it("should convert unions to IR format", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          ObjectNode: {
            fields: {
              label: "string",
            },
          },
          TextBox: {
            fields: {
              text: "string",
            },
          },
        },
      },
      {
        "add-union": {
          Node: {
            variants: {
              object: "ObjectNode",
              textBox: "TextBox",
            },
          },
        },
      },
      {
        "add-records": {
          Graph: {
            fields: {
              nodes: "array<Node>",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const graphModel = schema.models["Graph"];
    if (graphModel?.type !== "record") throw new Error("Expected record type");
    const graphRecord = graphModel.record;

    const nodesField = graphRecord.fields.find(f => f.key === "nodes");
    expect(nodesField?.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: {
          type: "modelRef",
          modelRef: {
            modelTypes: ["Node"],
          },
        },
      },
    });
  });

  it("should convert optional array types to IR format", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          Tag: {
            fields: {
              name: "string",
            },
          },
          Container: {
            docs: "A container with optional collections",
            fields: {
              tags: "optional<array<Tag>>",
              labels: "optional<array<string>>",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const containerModel = schema.models["Container"];
    expect(containerModel).toBeDefined();
    expect(containerModel?.type).toBe("record");
    if (containerModel?.type !== "record") throw new Error("Expected record type");
    const containerRecord = containerModel.record;

    // Check optional array of references
    const tagsField = containerRecord.fields.find(f => f.key === "tags");
    expect(tagsField?.isOptional).toBe(true);
    expect(tagsField?.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: {
          type: "modelRef",
          modelRef: {
            modelTypes: ["Tag"],
          },
        },
      },
    });

    // Check optional array of primitives
    const labelsField = containerRecord.fields.find(f => f.key === "labels");
    expect(labelsField?.isOptional).toBe(true);
    expect(labelsField?.fieldType).toEqual({
      type: "array",
      array: {
        allowNullValue: false,
        value: {
          type: "string",
          string: {},
        },
      },
    });
  });

  it("should handle modify-records step", () => {
    const steps: MigrationStep[] = [
      {
        "add-records": {
          Person: {
            fields: {
              name: "string",
            },
          },
        },
      },
      {
        "modify-records": {
          Person: {
            "add-fields": {
              age: "double",
              email: "optional<string>",
            },
          },
        },
      },
    ];

    const schema = convertStepsToIr(steps);
    const personModel = schema.models["Person"];
    expect(personModel).toBeDefined();
    expect(personModel?.type).toBe("record");
    if (personModel?.type !== "record") throw new Error("Expected record type");
    const personRecord = personModel.record;

    expect(personRecord.fields).toHaveLength(3);

    // Original field
    expect(personRecord.fields.find(f => f.key === "name")).toBeDefined();

    // Added fields
    expect(personRecord.fields.find(f => f.key === "age")).toBeDefined();

    const emailField = personRecord.fields.find(f => f.key === "email");
    expect(emailField).toBeDefined();
    expect(emailField?.isOptional).toBe(true);
  });
});

describe("parseMigrationSteps generic type validation", () => {
  function stepsWithField(fieldType: string): unknown {
    return [{ "add-records": { Foo: { fields: { bar: fieldType } } } }];
  }

  it.each([
    "optional<optional<string>>",
    "array<array<string>>",
    "list<list<double>>",
    "array<optional<string>>",
    "optional<array<array<string>>>",
    "optional<foo<string>>",
    "foo<string>",
  ])("should reject invalid nested generic type: %s", fieldType => {
    expect(() => parseMigrationSteps(stepsWithField(fieldType))).toThrow();
  });

  it.each([
    "optional<string>",
    "optional<double>",
    "optional<MyType>",
    "array<string>",
    "list<double>",
    "set<MyType>",
    "map<string>",
    "optional<array<string>>",
    "optional<list<Tag>>",
    "optional<set<double>>",
    "optional<map<string>>",
  ])("should accept valid generic type: %s", fieldType => {
    expect(() => parseMigrationSteps(stepsWithField(fieldType))).not.toThrow();
  });
});

describe("convertSchemaToIr alias handling", () => {
  it("preserves key = exportKey and name = declaredName for aliased records", () => {
    const ir = convertSchemaToIr({
      FooAlias: defineRecord("Foo", { docs: "A foo", fields: { x: P.String } }),
    });

    const model = ir.models["FooAlias"];
    expect(model).toBeDefined();
    expect(model!.type).toBe("record");
    if (model!.type === "record") {
      expect(model!.record.key).toBe("FooAlias");
      expect(model!.record.name).toBe("Foo");
    }
  });

  it("preserves key = exportKey and name = declaredName for aliased unions", () => {
    const Circle = defineRecord("Circle", { docs: "c", fields: { r: P.Double } });
    const ir = convertSchemaToIr({
      Circle,
      ShapeAlias: defineUnion("Shape", {
        docs: "A shape",
        variants: { circle: Circle },
      }),
    });

    const model = ir.models["ShapeAlias"];
    expect(model).toBeDefined();
    expect(model!.type).toBe("union");
    if (model!.type === "union") {
      expect(model!.union.key).toBe("ShapeAlias");
      expect(model!.union.name).toBe("Shape");
    }
  });

  it("resolves field refs and union variants to export keys", () => {
    const Inner = defineRecord("InnerModel", { docs: "i", fields: { v: P.String } });
    const ir = convertSchemaToIr({
      InnerAlias: Inner,
      Outer: defineRecord("Outer", {
        docs: "o",
        fields: { nested: Inner },
      }),
    });

    // The field ref should resolve to the export key "InnerAlias"
    const outerModel = ir.models["Outer"]!;
    expect(outerModel.type).toBe("record");
    if (outerModel.type === "record") {
      const nestedField = outerModel.record.fields.find((f: { key: string }) =>
        f.key === "nested"
      )!;
      expect(nestedField.fieldType.type).toBe("value");
      if (nestedField.fieldType.type === "value") {
        expect(nestedField.fieldType.value.type).toBe("modelRef");
        if (nestedField.fieldType.value.type === "modelRef") {
          expect(nestedField.fieldType.value.modelRef.modelTypes).toEqual(["InnerAlias"]);
        }
      }
    }
  });

  it("throws on duplicate declared model names", () => {
    expect(() =>
      convertSchemaToIr({
        AliasA: defineRecord("Foo", { docs: "a", fields: { x: P.String } }),
        AliasB: defineRecord("Foo", { docs: "b", fields: { y: P.String } }),
      })
    ).toThrow(/Duplicate declared model name "Foo"/);
  });
});
