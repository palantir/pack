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

import type { ReturnedSchema, Schema, SchemaBuilder } from "./defineMigration.js";
import { defineMigration } from "./defineMigration.js";

export const __schemaVersion: unique symbol = Symbol.for("__schemaVersion") as any;
export const __previousSchema: unique symbol = Symbol.for("__previousSchema") as any;

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
  build(): Schema<T>;
}

class SchemaVersionBuilderImpl<T extends ReturnedSchema> implements SchemaVersionBuilder<T> {
  private readonly schema: Schema<T>;
  private readonly version: number;
  private readonly previous: Schema<any>;

  constructor(schema: Schema<T>, version: number, previous: Schema<any>) {
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

  build(): Schema<T> {
    const result = { ...this.schema };
    Object.defineProperty(result, __schemaVersion, {
      value: this.version,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(result, __previousSchema, {
      value: this.previous,
      enumerable: false,
      writable: false,
    });
    return result;
  }
}

export function nextSchema<T extends ReturnedSchema>(
  previous: Schema<T>,
): SchemaVersionBuilder<T> {
  const previousVersion: number = (previous as Record<symbol, unknown>)[__schemaVersion] as number ?? 1;
  return new SchemaVersionBuilderImpl(previous, previousVersion + 1, previous);
}
