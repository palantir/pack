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
  UnionUpgradeRegistry,
  UpgradeFns,
  UpgradeRegistry,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import { applyLensToValue, applyReadLens, resolveAndApplyLens } from "../upgrade/UpgradeLens.js";

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
          addedInVersion: 2,
          fields: {
            fillColor: { derivedFrom: ["color"] },
            strokeColor: { derivedFrom: ["color"] },
          },
          removedFields: ["color"],
        },
      ],
    };
    const upgradeFns: UpgradeFns = {
      ShapeBox: {
        v2: {
          fillColor: ({ color }) => color,
          strokeColor: ({ color }) => color,
        },
      },
    };

    const rawData = { left: 10, color: "blue" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, upgradeFns);

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
          addedInVersion: 2,
          fields: {
            opacity: {
              derivedFrom: [],
              default: 1.0,
            },
          },
        },
      ],
    };

    const rawData = { left: 10 };
    // No upgrade function needed — purely additive, no forward derivation.
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, undefined);

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
          addedInVersion: 2,
          fields: {
            fillColor: { derivedFrom: ["color"] },
          },
        },
      ],
    };
    // No upgrade function: the lens must NOT invoke a forward when the target
    // is already present, so a missing entry is acceptable here.
    const rawData = { color: "blue", fillColor: "red" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, undefined);

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
          addedInVersion: 2,
          fields: {
            fillColor: { derivedFrom: ["color"] },
          },
        },
      ],
    };

    const rawData = { left: 10 }; // no 'color' field
    // No upgrade function: derivation should be skipped because source is missing.
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, undefined);

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
          addedInVersion: 2,
          fields: {
            hexColor: { derivedFrom: ["color"] },
          },
        },
        {
          addedInVersion: 3,
          fields: {
            rgbaColor: { derivedFrom: ["hexColor"] },
          },
        },
      ],
    };
    const upgradeFns: UpgradeFns = {
      ShapeBox: {
        v2: {
          hexColor: ({ color }) => `#${color}`,
        },
        v3: {
          rgbaColor: ({ hexColor }) => `rgba(${hexColor})`,
        },
      },
    };

    const rawData = { color: "FF0000" };
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, upgradeFns);

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
    const result = applyReadLens(rawData, registry, { ShapeBox: registry }, undefined);

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
          addedInVersion: 2,
          fields: {
            rgba: { derivedFrom: ["hex"] },
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

    const upgradeFns: UpgradeFns = {
      Color: {
        v2: {
          rgba: ({ hex }) => `rgba(${hex})`,
        },
      },
    };

    const rawData = { left: 10, color: { hex: "#FF0000" } };
    const result = applyReadLens(rawData, outerRegistry, allRegistries, upgradeFns);

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
          addedInVersion: 2,
          fields: {
            label: { derivedFrom: ["name"] },
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

    const upgradeFns: UpgradeFns = {
      Item: {
        v2: {
          label: ({ name }) => `Label: ${name}`,
        },
      },
    };

    const rawData = {
      items: [
        { name: "first" },
        { name: "second" },
      ],
    };
    const result = applyReadLens(rawData, parentRegistry, allRegistries, upgradeFns);
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
          addedInVersion: 2,
          fields: {
            displayValue: { derivedFrom: ["value"] },
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

    const upgradeFns: UpgradeFns = {
      Config: {
        v2: {
          displayValue: ({ value }) => `[${value}]`,
        },
      },
    };

    const rawData = {
      configs: {
        theme: { value: "dark" },
        lang: { value: "en" },
      },
    };
    const result = applyReadLens(rawData, parentRegistry, allRegistries, upgradeFns);
    const configs = result.configs as Record<string, Record<string, unknown>>;

    expect(configs.theme!.displayValue).toBe("[dark]");
    expect(configs.lang!.displayValue).toBe("[en]");
  });

  it("throws a clear error when a required upgrade function is missing", () => {
    const registry: UpgradeRegistry = {
      modelName: "ShapeBox",
      allFields: {
        color: { type: optionalPrimitive },
        fillColor: { type: optionalPrimitive },
      },
      steps: [
        {
          addedInVersion: 2,
          fields: {
            fillColor: { derivedFrom: ["color"] },
          },
        },
      ],
    };
    // Derivation IS triggered (color present, fillColor absent) but no upgradeFns provided.
    expect(() => applyReadLens({ color: "blue" }, registry, { ShapeBox: registry }, undefined))
      .toThrow(/Missing upgrade function for ShapeBox\.v2\.fillColor/);
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
        addedInVersion: 2,
        fields: {
          label: {
            derivedFrom: ["name"],
            default: "untitled",
          },
        },
      },
    ],
  };
  const allRegistries: UpgradeRegistryMap = { Item: registry };
  const upgradeFns: UpgradeFns = {
    Item: {
      v2: {
        label: ({ name }) => `derived:${name}`,
      },
    },
  };

  describe("target field presence", () => {
    it("missing key — derives from source", () => {
      const result = applyReadLens({ name: "hello" }, registry, allRegistries, upgradeFns);
      expect(result.label).toBe("derived:hello");
    });

    it("explicit undefined — treated as absent, derives from source", () => {
      const result = applyReadLens(
        { name: "hello", label: undefined },
        registry,
        allRegistries,
        upgradeFns,
      );
      expect(result.label).toBe("derived:hello");
    });

    it("null — treated as present, no derivation", () => {
      const result = applyReadLens(
        { name: "hello", label: null },
        registry,
        allRegistries,
        upgradeFns,
      );
      expect(result.label).toBeNull();
    });
  });

  describe("source field presence for derivation", () => {
    it("source missing — cannot derive, falls back to default", () => {
      const result = applyReadLens({}, registry, allRegistries, upgradeFns);
      expect(result.label).toBe("untitled");
    });

    it("source undefined — cannot derive, falls back to default", () => {
      const result = applyReadLens(
        { name: undefined },
        registry,
        allRegistries,
        upgradeFns,
      );
      expect(result.label).toBe("untitled");
    });

    it("source null — can derive (null is a present value)", () => {
      const result = applyReadLens({ name: null }, registry, allRegistries, upgradeFns);
      expect(result.label).toBe("derived:null");
    });
  });

  describe("default application", () => {
    it("applies default only when field is undefined after derivation", () => {
      const result = applyReadLens({}, registry, allRegistries, upgradeFns);
      expect(result.label).toBe("untitled");
    });

    it("does not apply default when field is null", () => {
      const result = applyReadLens({ label: null }, registry, allRegistries, upgradeFns);
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
      undefined,
    );
    expect(result).toBeUndefined();
  });

  it("null — passes through to inner type (null is a present value)", () => {
    const result = applyLensToValue(
      null,
      optionalPrimitive,
      {},
      undefined,
    );
    expect(result).toBeNull();
  });
});

describe("applyLensToValue", () => {
  it("returns primitive values unchanged", () => {
    const result = applyLensToValue("hello", primitive, {}, undefined);
    expect(result).toBe("hello");
  });

  it("returns undefined for optional undefined values", () => {
    const result = applyLensToValue(
      undefined,
      optionalPrimitive,
      {},
      undefined,
    );
    expect(result).toBeUndefined();
  });

  it("unwraps optional for non-undefined values", () => {
    const result = applyLensToValue(
      "hello",
      optionalPrimitive,
      {},
      undefined,
    );
    expect(result).toBe("hello");
  });

  it("returns value unchanged for modelRef with no registry", () => {
    const result = applyLensToValue(
      { a: 1 },
      { kind: "modelRef", model: "Unknown" },
      {},
      undefined,
    );
    expect(result).toEqual({ a: 1 });
  });

  it("returns value unchanged for modelRef with empty steps", () => {
    const registry: UpgradeRegistry = {
      modelName: "Empty",
      allFields: {},
      steps: [],
    };
    const result = applyLensToValue(
      { a: 1 },
      { kind: "modelRef", model: "Empty" },
      { Empty: registry },
      undefined,
    );
    expect(result).toEqual({ a: 1 });
  });
});

describe("resolveAndApplyLens", () => {
  const circleRegistry: UpgradeRegistry = {
    modelName: "Circle",
    allFields: {
      radius: { type: primitive },
      diameter: { type: optionalPrimitive },
    },
    steps: [
      {
        addedInVersion: 2,
        fields: {
          diameter: { derivedFrom: ["radius"] },
        },
      },
    ],
  };

  const rectRegistry: UpgradeRegistry = {
    modelName: "Rect",
    allFields: {
      width: { type: primitive },
      height: { type: primitive },
    },
    steps: [],
  };

  const shapeUnion: UnionUpgradeRegistry = {
    modelName: "Shape",
    discriminant: "kind",
    variants: { circle: "Circle", rect: "Rect" },
  };

  const allRegistries: UpgradeRegistryMap = {
    Shape: shapeUnion,
    Circle: circleRegistry,
    Rect: rectRegistry,
  };

  const upgradeFns: UpgradeFns = {
    Circle: {
      v2: {
        diameter: ({ radius }) => (radius as number) * 2,
      },
    },
  };

  it("routes to the correct variant lens based on discriminant", () => {
    const rawData = { kind: "circle", radius: 5 };
    const result = resolveAndApplyLens(rawData, shapeUnion, allRegistries, upgradeFns);

    expect(result.diameter).toBe(10);
    expect(result.radius).toBe(5);
  });

  it("returns raw data when discriminant value is not a known variant", () => {
    const rawData = { kind: "triangle", base: 3 };
    const result = resolveAndApplyLens(rawData, shapeUnion, allRegistries, upgradeFns);

    expect(result).toBe(rawData);
  });

  it("returns raw data when discriminant field is missing", () => {
    const rawData = { radius: 5 };
    const result = resolveAndApplyLens(rawData, shapeUnion, allRegistries, upgradeFns);

    expect(result).toBe(rawData);
  });

  it("returns raw data when variant has no upgrade steps", () => {
    const rawData = { kind: "rect", width: 10, height: 20 };
    const result = resolveAndApplyLens(rawData, shapeUnion, allRegistries, upgradeFns);

    expect(result).toBe(rawData);
  });

  it("delegates to applyReadLens for record registries with steps", () => {
    const rawData = { radius: 5 };
    const result = resolveAndApplyLens(rawData, circleRegistry, allRegistries, upgradeFns);

    expect(result.diameter).toBe(10);
  });

  it("returns raw data for record registries with no steps", () => {
    const rawData = { width: 10, height: 20 };
    const result = resolveAndApplyLens(rawData, rectRegistry, allRegistries, upgradeFns);

    expect(result).toBe(rawData);
  });

  describe("union → union recursion", () => {
    // Entity { type: "livingBeing", value: LivingBeing }
    // LivingBeing { kind: "animal", ...Animal fields }
    const animalRegistry: UpgradeRegistry = {
      modelName: "Animal",
      allFields: {
        species: { type: primitive },
        latinName: { type: optionalPrimitive },
      },
      steps: [
        {
          addedInVersion: 2,
          fields: {
            latinName: { derivedFrom: ["species"] },
          },
        },
      ],
    };

    const plantRegistry: UpgradeRegistry = {
      modelName: "Plant",
      allFields: {
        genus: { type: primitive },
      },
      steps: [],
    };

    const livingBeingUnion: UnionUpgradeRegistry = {
      modelName: "LivingBeing",
      discriminant: "kind",
      variants: { animal: "Animal", plant: "Plant" },
    };

    const entityUnion: UnionUpgradeRegistry = {
      modelName: "Entity",
      discriminant: "type",
      variants: { livingBeing: "LivingBeing" },
    };

    const nestedRegistries: UpgradeRegistryMap = {
      Entity: entityUnion,
      LivingBeing: livingBeingUnion,
      Animal: animalRegistry,
      Plant: plantRegistry,
    };

    const nestedUpgradeFns: UpgradeFns = {
      Animal: {
        v2: {
          latinName: ({ species }) => `Latinized(${species})`,
        },
      },
    };

    it("recursively upgrades union → union → record payloads", () => {
      const rawData = {
        type: "livingBeing",
        value: { kind: "animal", species: "Cat" },
      };
      const result = resolveAndApplyLens(rawData, entityUnion, nestedRegistries, nestedUpgradeFns);

      // The Animal record should be upgraded with latinName
      const inner = result.value as Record<string, unknown>;
      expect(inner.latinName).toBe("Latinized(Cat)");
      expect(inner.species).toBe("Cat");
      // Outer discriminant preserved
      expect(result.type).toBe("livingBeing");
    });

    it("returns raw data when nested value is missing", () => {
      const rawData = { type: "livingBeing" };
      const result = resolveAndApplyLens(rawData, entityUnion, nestedRegistries, nestedUpgradeFns);

      expect(result).toBe(rawData);
    });

    it("returns raw data when nested value is not an object", () => {
      const rawData = { type: "livingBeing", value: "not-an-object" };
      const result = resolveAndApplyLens(rawData, entityUnion, nestedRegistries, nestedUpgradeFns);

      expect(result).toBe(rawData);
    });

    it("returns raw data when nested union discriminant is unknown", () => {
      const rawData = {
        type: "livingBeing",
        value: { kind: "fungus", name: "Mushroom" },
      };
      const result = resolveAndApplyLens(rawData, entityUnion, nestedRegistries, nestedUpgradeFns);

      // Unknown variant at LivingBeing level — returned unchanged
      expect(result.type).toBe("livingBeing");
      expect((result.value as Record<string, unknown>).kind).toBe("fungus");
    });

    it("union → record routing still works alongside union → union", () => {
      const rawData = { kind: "animal", species: "Dog" };
      const result = resolveAndApplyLens(
        rawData,
        livingBeingUnion,
        nestedRegistries,
        nestedUpgradeFns,
      );

      expect(result.latinName).toBe("Latinized(Dog)");
    });
  });
});
