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
export function wrapUnknownVariant(discriminant: string, rawValue: PlainObject): PlainObject {
  return { [discriminant]: UNKNOWN_UNION_VARIANT, rawValue };
}

/**
 * Return a value as it should be saved or sent. Unwraps unknown union variants, e.g.
 * `[box, { shapeType: "unknown", rawValue: triangle }]` becomes `[box, triangle]`.
 *
 * @param newValue The value the app is saving or sending.
 * @param savedValue For a partial update, the record as already saved. A partial update can leave
 *   out a union's discriminant (e.g. `shapeType`), so this tells which variant the update is for.
 */
export function toStoredValue<T>(
  schema: DocumentSchema,
  modelName: string,
  newValue: T,
  savedValue?: unknown,
): T {
  // Each model's fields (records) or variants (unions), by model name.
  const allModels = getMetadata(schema).upgrades ?? {};

  function unwrapModel(value: unknown, saved: unknown, name: string): unknown {
    const model = allModels[name];
    if (model == null || !isPlainObject(value)) {
      return value;
    }
    const savedObject = isPlainObject(saved) ? saved : undefined;
    return isUnion(model)
      ? unwrapUnion(value, savedObject, model)
      : unwrapRecord(value, savedObject, model);
  }

  function unwrapUnion(
    value: PlainObject,
    saved: PlainObject | undefined,
    union: UnionUpgradeRegistry,
  ): unknown {
    const variantName = value[union.discriminant] ?? saved?.[union.discriminant];

    // The wrapper: put back the stored value.
    if (
      variantName === UNKNOWN_UNION_VARIANT && isStoredVariant(value.rawValue, union.discriminant)
    ) {
      return value.rawValue;
    }
    // Saving "unknown" without the stored variant would break the record for every app.
    if (value[union.discriminant] === UNKNOWN_UNION_VARIANT) {
      throw new Error(
        `Cannot save "${UNKNOWN_UNION_VARIANT}" as a ${union.modelName} variant:`
          + " rawValue must be the stored variant.",
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
        ? { ...value, value: unwrapModel(value.value, saved?.value, variantModelName) }
        : value;
    }
    return unwrapRecord(value, saved, variantModel);
  }

  function unwrapRecord(
    value: PlainObject,
    saved: PlainObject | undefined,
    record: UpgradeRegistry,
  ): PlainObject {
    const unwrapped: PlainObject = {};
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      const field = record.allFields[fieldName];
      unwrapped[fieldName] = field == null
        ? fieldValue
        : unwrapField(fieldValue, saved?.[fieldName], field.type);
    }
    return unwrapped;
  }

  function unwrapField(value: unknown, saved: unknown, type: FieldTypeDescriptor): unknown {
    if (value == null) {
      return value;
    }
    switch (type.kind) {
      case "primitive":
        return value;
      case "optional":
        return unwrapField(value, saved, type.inner);
      case "modelRef":
        return unwrapModel(value, saved, type.model);
      case "array":
        // Each list item has its own discriminant, so no saved value is needed.
        return Array.isArray(value)
          ? value.map(item => unwrapField(item, undefined, type.element))
          : value;
      case "map": {
        if (!isPlainObject(value)) {
          return value;
        }
        const savedMap = isPlainObject(saved) ? saved : undefined;
        const unwrapped: PlainObject = {};
        for (const [key, item] of Object.entries(value)) {
          unwrapped[key] = unwrapField(item, savedMap?.[key], type.value);
        }
        return unwrapped;
      }
    }
  }

  return unwrapModel(newValue, savedValue, modelName) as T;
}

function isUnion(model: UpgradeRegistryEntry): model is UnionUpgradeRegistry {
  return "discriminant" in model;
}

/** What the read step puts in `rawValue`: a stored variant, which always has its discriminant. */
function isStoredVariant(value: unknown, discriminant: string): value is PlainObject {
  return isPlainObject(value) && typeof value[discriminant] === "string";
}

function isPlainObject(value: unknown): value is PlainObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
