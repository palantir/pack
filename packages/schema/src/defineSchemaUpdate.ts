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

import type { ReturnedSchema, Schema, SchemaBuilder } from "./defineMigration.js";
import { defineMigration } from "./defineMigration.js";

export interface VersionedSchema<T extends ReturnedSchema = ReturnedSchema> {
  readonly models: T;
  readonly version: number;
  readonly previous?: VersionedSchema;
}

export function isVersionedSchema(value: unknown): value is VersionedSchema {
  return (
    typeof value === "object"
    && value != null
    && "models" in value
    && "version" in value
    && typeof (value as VersionedSchema).version === "number"
  );
}

export interface SchemaUpdate<T extends ReturnedSchema, S extends ReturnedSchema> {
  readonly name: string;
  readonly migration: (schema: SchemaBuilder<T>) => S;
}

export function defineSchemaUpdate<T extends ReturnedSchema, S extends ReturnedSchema>(
  name: string,
  migration: (schema: SchemaBuilder<T>) => S,
): SchemaUpdate<T, S> {
  return { name, migration };
}

export interface SchemaVersionBuilder<T extends ReturnedSchema> {
  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S>;
  build(): VersionedSchema<T>;
}

class SchemaVersionBuilderImpl<T extends ReturnedSchema> implements SchemaVersionBuilder<T> {
  private readonly schema: Schema<T>;
  private readonly version: number;
  private readonly previous: VersionedSchema;

  constructor(schema: Schema<T>, version: number, previous: VersionedSchema) {
    this.schema = schema;
    this.version = version;
    this.previous = previous;
  }

  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S> {
    const merged = defineMigration(this.schema, update.migration);
    return new SchemaVersionBuilderImpl(merged, this.version, this.previous);
  }

  build(): VersionedSchema<T> {
    return {
      models: { ...this.schema },
      version: this.version,
      previous: this.previous,
    };
  }
}

export function nextSchema<T extends ReturnedSchema>(
  previous: VersionedSchema<T>,
): SchemaVersionBuilder<T>;
export function nextSchema<T extends ReturnedSchema>(
  previous: Schema<T>,
): SchemaVersionBuilder<T>;
export function nextSchema(
  previous: ReturnedSchema | VersionedSchema,
): SchemaVersionBuilder<ReturnedSchema> {
  if (isVersionedSchema(previous)) {
    return new SchemaVersionBuilderImpl(previous.models, previous.version + 1, previous);
  }
  return new SchemaVersionBuilderImpl(previous, 2, { models: previous, version: 1 });
}
