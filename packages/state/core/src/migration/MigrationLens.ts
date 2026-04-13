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

import type {
  FieldTypeDescriptor,
  MigrationRegistry,
  MigrationRegistryMap,
} from "@palantir/pack.document-schema.model-types";

/**
 * Applies the read lens to raw record data using the migration registry.
 *
 * Walks migration steps in order, deriving missing fields from source fields
 * via forward transforms, applying defaults for additive fields, and
 * recursively applying the lens to nested model refs, arrays, and maps.
 *
 * Never writes back to the Y.Doc. Returns full data with no key deletion.
 */
export function applyReadLens(
  rawData: Record<string, unknown>,
  registry: MigrationRegistry,
  allRegistries: MigrationRegistryMap,
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
  allRegistries: MigrationRegistryMap,
): unknown {
  switch (type.kind) {
    case "primitive":
      return value;
    case "modelRef": {
      const subRegistry = allRegistries[type.model];
      if (!subRegistry || subRegistry.steps.length === 0) return value;
      return applyReadLens(value as Record<string, unknown>, subRegistry, allRegistries);
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
