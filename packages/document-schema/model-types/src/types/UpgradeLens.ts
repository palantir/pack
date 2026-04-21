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

/** Type descriptor for a field, enabling recursive lens application. */
export type FieldTypeDescriptor =
  | { kind: "primitive" }
  | { kind: "modelRef"; model: string }
  | { kind: "array"; element: FieldTypeDescriptor }
  | { kind: "map"; value: FieldTypeDescriptor }
  | { kind: "optional"; inner: FieldTypeDescriptor };

export interface FieldLensDef {
  /**
   * Source field names. `forward` receives only these fields, not the full record.
   * When empty, the field is additive — only `default` applies and `forward` is never called.
   */
  derivedFrom: string[];
  forward: (oldFields: Record<string, unknown>) => unknown;
  default?: unknown;
}

export interface FieldDef {
  type: FieldTypeDescriptor;
  default?: unknown;
}

export interface UpgradeStepDef {
  name: string;
  addedInVersion: number;
  fields: Record<string, FieldLensDef>;
  removedFields?: string[];
}

export interface UpgradeRegistry<ModelName extends string = string> {
  modelName: ModelName;
  /** All fields in the current schema (not just upgraded ones). Drives recursive lens application on nested types. */
  allFields: Record<string, FieldDef>;
  /** Must be in version order — the lens walks them sequentially. */
  steps: UpgradeStepDef[];
}

/**
 * Upgrade registry for union models. Instead of having its own fields/steps,
 * a union delegates to the variant's UpgradeRegistry based on the discriminant
 * value in the data.
 */
export interface UnionUpgradeRegistry<ModelName extends string = string> {
  modelName: ModelName;
  /** The field name used to discriminate between variants. */
  discriminant: string;
  /** Maps discriminant values to variant model names in the UpgradeRegistryMap. */
  variants: Record<string, string>;
}

export type UpgradeRegistryEntry = UpgradeRegistry | UnionUpgradeRegistry;

export type UpgradeRegistryMap = Record<string, UpgradeRegistryEntry>;
