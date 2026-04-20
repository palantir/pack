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
  FieldTypeDescriptor,
  UpgradeRegistry,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import { applyLensToValue, applyReadLens } from "../upgrade/UpgradeLens.js";

const primitive: FieldTypeDescriptor = { kind: "primitive" };
const optionalPrimitive: FieldTypeDescriptor = { kind: "optional", inner: primitive };

describe("applyReadLens", () => {
  it("applies forward transform when source fields are present and target is absent", () => {
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: primitive },
        color: { type: optionalPrimitive },
        fillColor: { type: optionalPrimitive },
        strokeColor: { type: optionalPrimitive },
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
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: primitive },
        opacity: { type: optionalPrimitive, default: 1.0 },
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
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        color: { type: optionalPrimitive },
        fillColor: { type: optionalPrimitive },
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
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        fillColor: { type: optionalPrimitive },
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

  it("walks chain of upgrade steps in order", () => {
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        color: { type: optionalPrimitive },
        hexColor: { type: optionalPrimitive },
        rgbaColor: { type: optionalPrimitive },
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
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: primitive },
      },
      steps: [],
    };

    const rawData = { left: 10, unknownField: "preserved" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry });

    expect(result.unknownField).toBe("preserved");
    expect(result.left).toBe(10);
  });

  it("recursively applies lens to nested modelRef fields", () => {
    const innerRegistry: UpgradeRegistry = {
      modelName: "Color",
      allFields: {
        hex: { type: optionalPrimitive },
        rgba: { type: optionalPrimitive },
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

    const outerRegistry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        left: { type: primitive },
        color: { type: { kind: "modelRef", model: "Color" } },
      },
      steps: [],
    };

    const allRegistries: UpgradeRegistryMap = {
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
    const itemRegistry: UpgradeRegistry = {
      modelName: "Item",
      allFields: {
        name: { type: primitive },
        label: { type: optionalPrimitive },
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

    const parentRegistry: UpgradeRegistry = {
      modelName: "Container",
      allFields: {
        items: { type: { kind: "array", element: { kind: "modelRef", model: "Item" } } },
      },
      steps: [],
    };

    const allRegistries: UpgradeRegistryMap = {
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
    const valueRegistry: UpgradeRegistry = {
      modelName: "Config",
      allFields: {
        value: { type: primitive },
        displayValue: { type: optionalPrimitive },
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

    const parentRegistry: UpgradeRegistry = {
      modelName: "Settings",
      allFields: {
        configs: { type: { kind: "map", value: { kind: "modelRef", model: "Config" } } },
      },
      steps: [],
    };

    const allRegistries: UpgradeRegistryMap = {
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

/**
 * Null vs undefined vs missing-key semantics.
 *
 * The lens uses `=== undefined` as the sole "absent" sentinel:
 *  - `undefined` (or missing key): field is absent — derive via forward transform, then default.
 *  - `null`: field is present with an explicit null value — no derivation, no default, preserved as-is.
 *  - `{ a: undefined }` vs `{}`: indistinguishable at runtime (`obj["a"]` is `undefined` either way).
 *
 * This aligns with Y.js `YMap` semantics: `YMap.get()` returns `undefined`
 * for deleted/missing keys, while `null` is a valid storable value.
 *
 * @see {@link https://github.com/yjs/yjs/blob/da7366c0852548b7d7055f3173f72e700a9d4510/src/ytype.js#L1860-L1864 | YMap.get — typeMapGet}
 */
describe("null / undefined / missing-key semantics", () => {
  // Shared registry: derives `label` from `name`, with a default of "untitled".
  const registry: UpgradeRegistry = {
    modelName: "Item",
    allFields: {
      name: { type: optionalPrimitive },
      label: { type: optionalPrimitive },
    },
    steps: [
      {
        name: "addLabel",
        addedInVersion: 2,
        fields: {
          label: {
            derivedFrom: ["name"],
            forward: ({ name }) => `derived:${name}`,
            default: "untitled",
          },
        },
      },
    ],
  };
  const allRegistries: UpgradeRegistryMap = { Item: registry };

  describe("target field presence", () => {
    it("missing key — derives from source", () => {
      const result = applyReadLens({ name: "hello" }, registry, allRegistries);
      expect(result.label).toBe("derived:hello");
    });

    it("explicit undefined — treated as absent, derives from source", () => {
      const result = applyReadLens({ name: "hello", label: undefined }, registry, allRegistries);
      expect(result.label).toBe("derived:hello");
    });

    it("null — treated as present, no derivation", () => {
      const result = applyReadLens({ name: "hello", label: null }, registry, allRegistries);
      expect(result.label).toBeNull();
    });
  });

  describe("source field presence for derivation", () => {
    it("source missing — cannot derive, falls back to default", () => {
      const result = applyReadLens({}, registry, allRegistries);
      expect(result.label).toBe("untitled");
    });

    it("source undefined — cannot derive, falls back to default", () => {
      const result = applyReadLens({ name: undefined }, registry, allRegistries);
      expect(result.label).toBe("untitled");
    });

    it("source null — can derive (null is a present value)", () => {
      const result = applyReadLens({ name: null }, registry, allRegistries);
      expect(result.label).toBe("derived:null");
    });
  });

  describe("default application", () => {
    it("applies default only when field is undefined after derivation", () => {
      const result = applyReadLens({}, registry, allRegistries);
      expect(result.label).toBe("untitled");
    });

    it("does not apply default when field is null", () => {
      const result = applyReadLens({ label: null }, registry, allRegistries);
      expect(result.label).toBeNull();
    });
  });
});

describe("applyLensToValue — optional null/undefined", () => {
  it("undefined — returns undefined without recursing into inner type", () => {
    const result = applyLensToValue(
      undefined,
      optionalPrimitive,
      {},
    );
    expect(result).toBeUndefined();
  });

  it("null — passes through to inner type (null is a present value)", () => {
    const result = applyLensToValue(
      null,
      optionalPrimitive,
      {},
    );
    expect(result).toBeNull();
  });
});

describe("applyLensToValue", () => {
  it("returns primitive values unchanged", () => {
    const result = applyLensToValue("hello", primitive, {});
    expect(result).toBe("hello");
  });

  it("returns undefined for optional undefined values", () => {
    const result = applyLensToValue(
      undefined,
      optionalPrimitive,
      {},
    );
    expect(result).toBeUndefined();
  });

  it("unwraps optional for non-undefined values", () => {
    const result = applyLensToValue(
      "hello",
      optionalPrimitive,
      {},
    );
    expect(result).toBe("hello");
  });

  it("returns value unchanged for modelRef with no registry", () => {
    const result = applyLensToValue({ a: 1 }, { kind: "modelRef", model: "Unknown" }, {});
    expect(result).toEqual({ a: 1 });
  });

  it("returns value unchanged for modelRef with empty steps", () => {
    const registry: UpgradeRegistry = {
      modelName: "Empty",
      allFields: {},
      steps: [],
    };
    const result = applyLensToValue({ a: 1 }, { kind: "modelRef", model: "Empty" }, {
      Empty: registry,
    });
    expect(result).toEqual({ a: 1 });
  });
});
