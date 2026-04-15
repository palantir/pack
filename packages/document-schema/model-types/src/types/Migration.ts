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

/** Type descriptor for a field, enabling recursive lens application. */
export type FieldTypeDescriptor =
  | { kind: "primitive" }
  | { kind: "modelRef"; model: string }
  | { kind: "array"; element: FieldTypeDescriptor }
  | { kind: "map"; value: FieldTypeDescriptor }
  | { kind: "optional"; inner: FieldTypeDescriptor };

export interface FieldMigrationDef {
  derivedFrom: string[];
  forward: (oldFields: Record<string, unknown>) => unknown;
  default?: unknown;
}

export interface FieldDef {
  type: FieldTypeDescriptor;
  default?: unknown;
}

export interface MigrationStepDef {
  name: string;
  addedInVersion: number;
  fields: Record<string, FieldMigrationDef>;
  removedFields?: string[];
}

export interface MigrationRegistry<ModelName extends string = string> {
  modelName: ModelName;
  allFields: Record<string, FieldDef>;
  steps: MigrationStepDef[];
}

/**
 * Migration registry for union models. Instead of having its own fields/steps,
 * a union delegates to the variant's MigrationRegistry based on the discriminant
 * value in the data.
 */
export interface UnionMigrationRegistry<ModelName extends string = string> {
  modelName: ModelName;
  /** The field name used to discriminate between variants. */
  discriminant: string;
  /** Maps discriminant values to variant model names in the MigrationRegistryMap. */
  variants: Record<string, string>;
}

export type MigrationRegistryEntry = MigrationRegistry | UnionMigrationRegistry;

export type MigrationRegistryMap = Record<string, MigrationRegistryEntry>;
