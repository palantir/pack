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

import * as P from "@palantir/pack.schema";
import { describe, expect, it } from "vitest";
import yaml from "yaml";
import {
  convertSchemaToSteps,
  convertStepsToYamlString,
  convertVersionedSchemaToSteps,
} from "../../../utils/schema/convertSchemaToSteps.js";

describe("Schema to YAML Integration", () => {
  it("should convert schema to valid YAML format", () => {
    const schema = P.defineMigration({}, () => {
      const position = {
        x: P.Double,
        y: P.Double,
      };

      const ObjectNode = P.defineRecord("ObjectNode", {
        docs: "A node in the graph",
        fields: {
          ...position,
          label: P.Optional(P.String),
        },
      });

      const TextBox = P.defineRecord("TextBox", {
        docs: "A text box",
        fields: {
          ...position,
          text: P.String,
        },
      });

      const Edge = P.defineRecord("Edge", {
        docs: "An edge between nodes",
        fields: {
          source: () => ObjectNode,
          target: () => ObjectNode,
        },
      });

      const Node = P.defineUnion("Node", {
        docs: "Any node type",
        variants: {
          object: ObjectNode,
          textBox: TextBox,
        },
      });

      return { ObjectNode, TextBox, Edge, Node };
    });

    const steps = convertSchemaToSteps(schema);
    const yamlString = convertStepsToYamlString(steps);
    const parsedSteps = yaml.parse(yamlString) as Array<Record<string, unknown>>;

    expect(parsedSteps).toBeInstanceOf(Array);
    expect(parsedSteps.length).toBeGreaterThan(0);

    const recordsStep = parsedSteps.find(step => "add-records" in step);
    expect(recordsStep).toBeDefined();
    expect(recordsStep?.["add-records"]).toMatchObject({
      ObjectNode: {
        fields: {
          x: "double",
          y: "double",
          label: "optional<string>",
        },
      },
      TextBox: {
        fields: {
          x: "double",
          y: "double",
          text: "string",
        },
      },
      Edge: {
        fields: {
          source: "ObjectNode",
          target: "ObjectNode",
        },
      },
    });

    const unionStep = parsedSteps.find(step => "add-union" in step);
    expect(unionStep).toBeDefined();
    expect(unionStep?.["add-union"]).toMatchObject({
      Node: {
        variants: {
          object: "ObjectNode",
          textBox: "TextBox",
        },
      },
    });
  });

  it("should convert a versioned schema with migration metadata to YAML", () => {
    const schemaV0 = P.defineMigration({}, () => ({
      Shape: P.defineRecord("Shape", {
        docs: "A shape",
        fields: {
          left: P.Double,
          right: P.Double,
          color: P.Optional(P.String),
        },
      }),
    }));

    const addColorSplit = P.defineSchemaUpdate("addColorSplit", (schema: any) => ({
      Shape: schema.Shape
        .addField("fillColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: Record<string, unknown>) => color,
        })
        .addField("strokeColor", P.Optional(P.String), {
          derivedFrom: ["color"],
          forward: ({ color }: Record<string, unknown>) => color,
        })
        .build(),
    }));

    const addOpacity = P.defineSchemaUpdate("addOpacity", (schema: any) => ({
      Shape: schema.Shape
        .addField("opacity", P.Optional(P.Double), { default: 1.0 })
        .build(),
    }));

    const schemaV1 = P.nextSchema(schemaV0)
      .addSchemaUpdate(addColorSplit, "soak")
      .addSchemaUpdate(addOpacity, "finalize")
      .build();

    const steps = convertVersionedSchemaToSteps(schemaV1);
    const yamlString = convertStepsToYamlString(steps);
    const parsedSteps = yaml.parse(yamlString) as Array<Record<string, unknown>>;

    // Should have a baseline step (version 0) and a version 1 step
    expect(parsedSteps.length).toBe(2);

    // Baseline step: base fields only (no migration-added fields)
    const baselineStep = parsedSteps[0]!;
    expect(baselineStep["version"]).toBe(0);
    expect(baselineStep["add-records"]).toBeDefined();
    const baseRecords = baselineStep["add-records"] as Record<string, any>;
    expect(baseRecords["Shape"]).toBeDefined();
    expect(baseRecords["Shape"].fields).toHaveProperty("left");
    expect(baseRecords["Shape"].fields).toHaveProperty("right");
    expect(baseRecords["Shape"].fields).toHaveProperty("color");
    // Baseline should NOT have migration-added fields
    expect(baseRecords["Shape"].fields).not.toHaveProperty("fillColor");
    expect(baseRecords["Shape"].fields).not.toHaveProperty("strokeColor");
    expect(baseRecords["Shape"].fields).not.toHaveProperty("opacity");

    // Version 1 step: schema updates with migration metadata
    const v1Step = parsedSteps[1]!;
    expect(v1Step["version"]).toBe(1);
    expect(v1Step["schema-updates"]).toBeDefined();
    const updates = v1Step["schema-updates"] as Array<Record<string, any>>;
    expect(updates.length).toBeGreaterThan(0);

    // Find the addColorSplit update
    const colorSplitUpdate = updates.find((u: any) => u.name === "addColorSplit");
    expect(colorSplitUpdate).toBeDefined();
    expect(colorSplitUpdate!.stage).toBe("soak");
    expect(colorSplitUpdate!["modify-records"]).toBeDefined();

    const shapeModify = colorSplitUpdate!["modify-records"]["Shape"];
    expect(shapeModify["add-fields"]["fillColor"]).toMatchObject({
      type: "optional<string>",
      "derived-from": ["color"],
    });
    expect(shapeModify["add-fields"]["strokeColor"]).toMatchObject({
      type: "optional<string>",
      "derived-from": ["color"],
    });

    // Verify the YAML is valid and round-trips
    expect(yamlString).toContain("version:");
    expect(yamlString).toContain("schema-updates:");
    expect(yamlString).toContain("derived-from:");
    expect(yamlString).not.toContain("on-finalize:");
  });
});
