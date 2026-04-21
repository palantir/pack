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
  UpgradeRegistry,
  UpgradeRegistryEntry,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";

function isUnionRegistry(entry: UpgradeRegistryEntry): entry is UnionUpgradeRegistry {
  return "discriminant" in entry;
}

/**
 * Resolve an upgrade registry entry and apply the read lens.
 *
 * For record registries, applies the lens directly.
 * For union registries, reads the discriminant from the data to determine the
 * variant, then applies that variant's lens.
 */
export function resolveAndApplyLens(
  rawData: Record<string, unknown>,
  entry: UpgradeRegistryEntry,
  allRegistries: UpgradeRegistryMap,
): Record<string, unknown> {
  if (isUnionRegistry(entry)) {
    const discriminantValue = rawData[entry.discriminant];
    if (typeof discriminantValue === "string") {
      const variantModelName = entry.variants[discriminantValue];
      if (variantModelName != null) {
        const variantRegistry = allRegistries[variantModelName];
        if (
          variantRegistry != null && !isUnionRegistry(variantRegistry)
          && variantRegistry.steps.length > 0
        ) {
          return applyReadLens(rawData, variantRegistry, allRegistries);
        }
      }
    }
    return rawData;
  }

  if (entry.steps.length > 0) {
    return applyReadLens(rawData, entry, allRegistries);
  }

  return rawData;
}

/**
 * Applies the read lens to raw record data using the upgrade registry.
 *
 * Walks upgrade steps in order, deriving missing fields from source fields
 * via forward transforms, applying defaults for additive fields, and
 * recursively applying the lens to nested model refs, arrays, and maps.
 *
 * Never writes back to the Y.Doc. Returns full data with no key deletion.
 *
 * ## Null / undefined semantics
 *
 * The lens uses `=== undefined` as the sole "absent" sentinel:
 *  - **`undefined` (or missing key)**: field is absent. The lens will attempt
 *    to derive it via a forward transform, then fall back to the step default.
 *  - **`null`**: field is explicitly present with a null value. The lens will
 *    not derive or default — `null` is preserved as-is.
 *  - **`{ a: undefined }` vs `{}`**: indistinguishable — `obj["a"]` yields
 *    `undefined` in both cases, so both are treated as absent.
 *
 * This aligns with Y.js `YMap` semantics: `YMap.get()` returns `undefined`
 * for keys that were never set or were deleted, while `null` is a valid
 * storable value via `YMap.set(key, null)`.
 *
 * @see {@link https://github.com/yjs/yjs/blob/da7366c0852548b7d7055f3173f72e700a9d4510/src/ytype.js#L1860-L1864 | YMap.get — typeMapGet}
 */
export function applyReadLens(
  rawData: Record<string, unknown>,
  registry: UpgradeRegistry,
  allRegistries: UpgradeRegistryMap,
): Record<string, unknown> {
  const data = { ...rawData };

  // 1. Apply forward transforms for derived fields
  for (const step of registry.steps) {
    for (const [fieldName, def] of Object.entries(step.fields)) {
      if (def.derivedFrom.length === 0) continue; // additive, skip to defaults
      if (data[fieldName] !== undefined) continue; // already present, use as-is

      // Check if source fields are available to derive from
      const sourceFields: Record<string, unknown> = {};
      let canDerive = true;
      for (const src of def.derivedFrom) {
        if (data[src] === undefined) {
          canDerive = false;
          break;
        }
        sourceFields[src] = data[src];
      }

      if (canDerive) {
        data[fieldName] = def.forward(sourceFields);
      }
    }
  }

  // 2. Apply defaults for additive fields
  for (const step of registry.steps) {
    for (const [fieldName, def] of Object.entries(step.fields)) {
      if (data[fieldName] === undefined && def.default !== undefined) {
        data[fieldName] = def.default;
      }
    }
  }

  // 3. Recursively apply lens to nested model refs
  for (const [fieldName, fieldDef] of Object.entries(registry.allFields)) {
    if (data[fieldName] === undefined) continue;
    data[fieldName] = applyLensToValue(data[fieldName], fieldDef.type, allRegistries);
  }

  // Full data returned. TypeScript types govern field visibility — no runtime key deletion.
  return data;
}

/** Recursively apply lens to a value based on its type descriptor. */
export function applyLensToValue(
  value: unknown,
  type: FieldTypeDescriptor,
  allRegistries: UpgradeRegistryMap,
): unknown {
  switch (type.kind) {
    case "primitive":
      return value;
    case "modelRef": {
      const subEntry = allRegistries[type.model];
      if (!subEntry) return value;
      return resolveAndApplyLens(value as Record<string, unknown>, subEntry, allRegistries);
    }
    case "array":
      return (value as unknown[]).map(item => applyLensToValue(item, type.element, allRegistries));
    case "map":
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map((
          [k, v],
        ) => [k, applyLensToValue(v, type.value, allRegistries)]),
      );
    case "optional":
      return value === undefined ? undefined : applyLensToValue(value, type.inner, allRegistries);
  }
}
