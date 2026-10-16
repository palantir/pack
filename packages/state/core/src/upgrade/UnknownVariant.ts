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

/*
 * Unknown union variants.
 *
 * A newer app can save a variant this app doesn't know, e.g. a `triangle` shape when this app
 * only knows `box` and `circle`:
 * - On read, the SDK wraps it: `{ shapeType: "unknown", rawValue: <the triangle> }`.
 * - On save or send, the SDK unwraps it, so the triangle is stored unchanged.
 *
 * The unwrap matters when the triangle is inside something this app edits, e.g. a list of
 * shapes: saving the list must not replace the triangle with the wrapper.
 */

import type {
  DocumentSchema,
  FieldTypeDescriptor,
  UnionUpgradeRegistry,
  UpgradeRegistry,
  UpgradeRegistryEntry,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata, UNKNOWN_UNION_VARIANT } from "@palantir/pack.document-schema.model-types";

type PlainObject = Record<string, unknown>;

/** Wrap a stored union value whose variant this app doesn't know. */
export function createUnknownVariant(discriminant: string, rawValue: PlainObject): PlainObject {
  return { [discriminant]: UNKNOWN_UNION_VARIANT, rawValue };
}

/**
 * Unwrap every unknown variant in a value before it is saved or sent, e.g.
 * `[box, { shapeType: "unknown", rawValue: triangle }]` becomes `[box, triangle]`.
 *
 * @param newValue The value the app is saving or sending.
 * @param savedValue For a partial update, the record as already saved. A partial update can leave
 *   out a union's discriminant (e.g. `shapeType`), so this tells which variant the update is for.
 */
export function restoreUnknownVariants<T>(
  schema: DocumentSchema,
  modelName: string,
  newValue: T,
  savedValue?: unknown,
): T {
  // Each model's fields (records) or variants (unions), by model name.
  const allModels = getMetadata(schema).upgrades ?? {};

  function restoreModel(value: unknown, saved: unknown, name: string): unknown {
    const model = allModels[name];
    if (model == null || !isPlainObject(value)) {
      return value;
    }
    const savedObject = isPlainObject(saved) ? saved : undefined;
    return isUnion(model)
      ? restoreUnion(value, savedObject, model)
      : restoreRecord(value, savedObject, model);
  }

  function restoreUnion(
    value: PlainObject,
    saved: PlainObject | undefined,
    union: UnionUpgradeRegistry,
  ): unknown {
    const variantName = value[union.discriminant] ?? saved?.[union.discriminant];

    // The wrapper: put back the stored value.
    if (variantName === UNKNOWN_UNION_VARIANT && "rawValue" in value) {
      return value.rawValue;
    }
    // Saving "unknown" with no stored value would mark a real variant.
    if (value[union.discriminant] === UNKNOWN_UNION_VARIANT) {
      throw new Error(
        `Cannot save "${UNKNOWN_UNION_VARIANT}" as a ${union.modelName} variant without a rawValue.`,
      );
    }

    // A known variant, e.g. a box: check its own fields.
    const variantModelName = typeof variantName === "string"
      ? union.variants[variantName]
      : undefined;
    const variantModel = variantModelName == null ? undefined : allModels[variantModelName];
    if (variantModelName == null || variantModel == null) {
      return value;
    }
    if (isUnion(variantModel)) {
      // A variant that is itself a union keeps its data under `value`.
      return "value" in value
        ? { ...value, value: restoreModel(value.value, saved?.value, variantModelName) }
        : value;
    }
    return restoreRecord(value, saved, variantModel);
  }

  function restoreRecord(
    value: PlainObject,
    saved: PlainObject | undefined,
    record: UpgradeRegistry,
  ): PlainObject {
    const restored: PlainObject = {};
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      const field = record.allFields[fieldName];
      restored[fieldName] = field == null
        ? fieldValue
        : restoreField(fieldValue, saved?.[fieldName], field.type);
    }
    return restored;
  }

  function restoreField(value: unknown, saved: unknown, type: FieldTypeDescriptor): unknown {
    if (value == null) {
      return value;
    }
    switch (type.kind) {
      case "primitive":
        return value;
      case "optional":
        return restoreField(value, saved, type.inner);
      case "modelRef":
        return restoreModel(value, saved, type.model);
      case "array":
        // Each list item has its own discriminant, so no saved value is needed.
        return Array.isArray(value)
          ? value.map(item => restoreField(item, undefined, type.element))
          : value;
      case "map": {
        if (!isPlainObject(value)) {
          return value;
        }
        const savedMap = isPlainObject(saved) ? saved : undefined;
        const restored: PlainObject = {};
        for (const [key, item] of Object.entries(value)) {
          restored[key] = restoreField(item, savedMap?.[key], type.value);
        }
        return restored;
      }
    }
  }

  return restoreModel(newValue, savedValue, modelName) as T;
}

function isUnion(model: UpgradeRegistryEntry): model is UnionUpgradeRegistry {
  return "discriminant" in model;
}

function isPlainObject(value: unknown): value is PlainObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
