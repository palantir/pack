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

import type { MigrationRegistry, MigrationRegistryMap } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import { applyLensToValue, applyReadLens } from "../migration/MigrationLens.js";

describe("applyReadLens", () => {
  it("applies forward transform when source fields are present and target is absent", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: { kind: "primitive" } },
        color: { type: { kind: "optional", inner: { kind: "primitive" } } },
        fillColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
        strokeColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addColorSplit",
          addedInVersion: 2,
          fields: {
            fillColor: {
              derivedFrom: ["color"],
              forward: ({ color }) => color,
            },
            strokeColor: {
              derivedFrom: ["color"],
              forward: ({ color }) => color,
            },
          },
          removedFields: ["color"],
        },
      ],
    };

    const rawData = { left: 10, color: "blue" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.fillColor).toBe("blue");
    expect(result.strokeColor).toBe("blue");
    expect(result.color).toBe("blue"); // not deleted — passthrough
    expect(result.left).toBe(10);
  });

  it("applies default values for additive fields", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: { kind: "primitive" } },
        opacity: { type: { kind: "optional", inner: { kind: "primitive" } }, default: 1.0 },
      },
      steps: [
        {
          name: "addOpacity",
          addedInVersion: 2,
          fields: {
            opacity: {
              derivedFrom: [],
              forward: () => undefined,
              default: 1.0,
            },
          },
        },
      ],
    };

    const rawData = { left: 10 };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.opacity).toBe(1.0);
    expect(result.left).toBe(10);
  });

  it("does not overwrite a field that is already present", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        color: { type: { kind: "optional", inner: { kind: "primitive" } } },
        fillColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addColorSplit",
          addedInVersion: 2,
          fields: {
            fillColor: {
              derivedFrom: ["color"],
              forward: ({ color }) => color,
            },
          },
        },
      ],
    };

    const rawData = { color: "blue", fillColor: "red" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.fillColor).toBe("red"); // existing value preserved
  });

  it("does not derive when source fields are missing", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        fillColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addColorSplit",
          addedInVersion: 2,
          fields: {
            fillColor: {
              derivedFrom: ["color"],
              forward: ({ color }) => color,
            },
          },
        },
      ],
    };

    const rawData = { left: 10 }; // no 'color' field
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.fillColor).toBeUndefined();
  });

  it("walks chain of migration steps in order", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        color: { type: { kind: "optional", inner: { kind: "primitive" } } },
        hexColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
        rgbaColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addHexColor",
          addedInVersion: 2,
          fields: {
            hexColor: {
              derivedFrom: ["color"],
              forward: ({ color }) => `#${color}`,
            },
          },
        },
        {
          name: "addRgbaColor",
          addedInVersion: 3,
          fields: {
            rgbaColor: {
              derivedFrom: ["hexColor"],
              forward: ({ hexColor }) => `rgba(${hexColor})`,
            },
          },
        },
      ],
    };

    const rawData = { color: "FF0000" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.hexColor).toBe("#FF0000");
    expect(result.rgbaColor).toBe("rgba(#FF0000)");
  });

  it("preserves unknown fields (passthrough)", () => {
    const registry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: { kind: "primitive" } },
      },
      steps: [],
    };

    const rawData = { left: 10, unknownField: "preserved" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.unknownField).toBe("preserved");
    expect(result.left).toBe(10);
  });

  it("recursively applies lens to nested modelRef fields", () => {
    const innerRegistry: MigrationRegistry = {
      modelName: "Color",
      allFields: {
        hex: { type: { kind: "optional", inner: { kind: "primitive" } } },
        rgba: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addRgba",
          addedInVersion: 2,
          fields: {
            rgba: {
              derivedFrom: ["hex"],
              forward: ({ hex }) => `rgba(${hex})`,
            },
          },
        },
      ],
    };

    const outerRegistry: MigrationRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: { kind: "primitive" } },
        color: { type: { kind: "modelRef", model: "Color" } },
      },
      steps: [],
    };

    const allRegistries: MigrationRegistryMap = {
      ShapeBox: outerRegistry,
      Color: innerRegistry,
    };

    const rawData = { left: 10, color: { hex: "#FF0000" } };
    const result = applyReadLens(rawData, outerRegistry, allRegistries);

    expect(result.left).toBe(10);
    expect((result.color as Record<string, unknown>).rgba).toBe("rgba(#FF0000)");
    expect((result.color as Record<string, unknown>).hex).toBe("#FF0000");
  });

  it("recursively applies lens to array elements", () => {
    const itemRegistry: MigrationRegistry = {
      modelName: "Item",
      allFields: {
        name: { type: { kind: "primitive" } },
        label: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addLabel",
          addedInVersion: 2,
          fields: {
            label: {
              derivedFrom: ["name"],
              forward: ({ name }) => `Label: ${name}`,
            },
          },
        },
      ],
    };

    const parentRegistry: MigrationRegistry = {
      modelName: "Container",
      allFields: {
        items: { type: { kind: "array", element: { kind: "modelRef", model: "Item" } } },
      },
      steps: [],
    };

    const allRegistries: MigrationRegistryMap = {
      Container: parentRegistry,
      Item: itemRegistry,
    };

    const rawData = {
      items: [
        { name: "first" },
        { name: "second" },
      ],
    };
    const result = applyReadLens(rawData, parentRegistry, allRegistries);
    const items = result.items as Array<Record<string, unknown>>;

    expect(items[0]!.label).toBe("Label: first");
    expect(items[1]!.label).toBe("Label: second");
  });

  it("recursively applies lens to map values", () => {
    const valueRegistry: MigrationRegistry = {
      modelName: "Config",
      allFields: {
        value: { type: { kind: "primitive" } },
        displayValue: { type: { kind: "optional", inner: { kind: "primitive" } } },
      },
      steps: [
        {
          name: "addDisplayValue",
          addedInVersion: 2,
          fields: {
            displayValue: {
              derivedFrom: ["value"],
              forward: ({ value }) => `[${value}]`,
            },
          },
        },
      ],
    };

    const parentRegistry: MigrationRegistry = {
      modelName: "Settings",
      allFields: {
        configs: { type: { kind: "map", value: { kind: "modelRef", model: "Config" } } },
      },
      steps: [],
    };

    const allRegistries: MigrationRegistryMap = {
      Settings: parentRegistry,
      Config: valueRegistry,
    };

    const rawData = {
      configs: {
        theme: { value: "dark" },
        lang: { value: "en" },
      },
    };
    const result = applyReadLens(rawData, parentRegistry, allRegistries);
    const configs = result.configs as Record<string, Record<string, unknown>>;

    expect(configs.theme!.displayValue).toBe("[dark]");
    expect(configs.lang!.displayValue).toBe("[en]");
  });
});

describe("applyLensToValue", () => {
  it("returns primitive values unchanged", () => {
    const result = applyLensToValue("hello", { kind: "primitive" }, {});
    expect(result).toBe("hello");
  });

  it("returns undefined for optional undefined values", () => {
    const result = applyLensToValue(undefined, { kind: "optional", inner: { kind: "primitive" } }, {});
    expect(result).toBeUndefined();
  });

  it("unwraps optional for non-undefined values", () => {
    const result = applyLensToValue("hello", { kind: "optional", inner: { kind: "primitive" } }, {});
    expect(result).toBe("hello");
  });

  it("returns value unchanged for modelRef with no registry", () => {
    const result = applyLensToValue({ a: 1 }, { kind: "modelRef", model: "Unknown" }, {});
    expect(result).toEqual({ a: 1 });
  });

  it("returns value unchanged for modelRef with empty steps", () => {
    const registry: MigrationRegistry = {
      modelName: "Empty",
      allFields: {},
      steps: [],
    };
    const result = applyLensToValue({ a: 1 }, { kind: "modelRef", model: "Empty" }, { Empty: registry });
    expect(result).toEqual({ a: 1 });
  });
});
