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

import type { SchemaBuilder } from "./defineMigration.js";
import { defineMigration } from "./defineMigration.js";
import type { ModelDefs } from "./defs.js";

export interface InitialSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "initial";
  readonly models: T;
}

export interface VersionedSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "versioned";
  readonly models: T;
  readonly version: number;
  readonly previous: SchemaDefinition;
}

export type SchemaDefinition<T extends ModelDefs = ModelDefs> =
  | InitialSchema<T>
  | VersionedSchema<T>;

export function defineSchema<T extends ModelDefs>(models: T): InitialSchema<T> {
  return { type: "initial", models };
}

export interface SchemaUpdate<T extends ModelDefs, S extends ModelDefs> {
  readonly name: string;
  readonly migration: (schema: SchemaBuilder<T>) => S;
}

export function defineSchemaUpdate<T extends ModelDefs, S extends ModelDefs>(
  name: string,
  migration: (schema: SchemaBuilder<T>) => S,
): SchemaUpdate<T, S> {
  return { name, migration };
}

export interface SchemaVersionBuilder<T extends ModelDefs> {
  addSchemaUpdate<S extends ModelDefs>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S>;
  build(): VersionedSchema<T>;
}

class SchemaVersionBuilderImpl<T extends ModelDefs> implements SchemaVersionBuilder<T> {
  private readonly models: T;
  private readonly version: number;
  private readonly previous: SchemaDefinition;

  constructor(models: T, version: number, previous: SchemaDefinition) {
    this.models = models;
    this.version = version;
    this.previous = previous;
  }

  addSchemaUpdate<S extends ModelDefs>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S> {
    const merged = defineMigration(this.models, update.migration);
    return new SchemaVersionBuilderImpl(merged, this.version, this.previous);
  }

  build(): VersionedSchema<T> {
    return {
      type: "versioned",
      models: { ...this.models },
      version: this.version,
      previous: this.previous,
    };
  }
}

export function nextSchema<T extends ModelDefs>(
  previous: SchemaDefinition<T>,
): SchemaVersionBuilder<T> {
  const prevVersion = previous.type === "versioned" ? previous.version : 1;
  return new SchemaVersionBuilderImpl(previous.models, prevVersion + 1, previous);
}
