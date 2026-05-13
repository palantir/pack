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
import { applyMigration } from "./defineMigration.js";
import type { ModelDefs } from "./defs.js";

export interface InitialSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "initial";
  readonly version: 1;
  readonly models: T;
}

export interface FieldMigration {
  readonly derivedFrom: readonly string[];
  readonly forward: (oldFields: Record<string, unknown>) => unknown;
}

export type VersionMigrations = Record<string, Record<string, FieldMigration>>;

export interface VersionedSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "versioned";
  readonly models: T;
  readonly version: number;
  readonly previous: SchemaDefinition;
  readonly migrations?: VersionMigrations;
}

export type SchemaDefinition<T extends ModelDefs = ModelDefs> =
  | InitialSchema<T>
  | VersionedSchema<T>;

export function defineSchema<T extends ModelDefs>(models: T): InitialSchema<T> {
  return { type: "initial", version: 1, models };
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
  withMigrations(migrations: VersionMigrations): SchemaVersionBuilder<T>;
  build(): VersionedSchema<T>;
}

/**
 * Merge two `VersionMigrations` records. Per-model field migrations from
 * `override` take precedence over `base` for the same field, but the maps are
 * combined at both the model and field level so explicit `withMigrations`
 * calls can supplement (not just replace) the sugar from `addField` options.
 */
function mergeMigrations(
  base: VersionMigrations | undefined,
  override: VersionMigrations | undefined,
): VersionMigrations | undefined {
  if (base == null) return override;
  if (override == null) return base;
  const result: VersionMigrations = { ...base };
  for (const [modelKey, fields] of Object.entries(override)) {
    result[modelKey] = { ...result[modelKey], ...fields };
  }
  return result;
}

/**
 * Drop migration entries that no longer correspond to a field on a record in
 * `models`. Required because `mergeMigrations` is monotonic — a later
 * `addSchemaUpdate` that removes or retypes a field would otherwise leave a
 * stale entry in the accumulator. Entries are dropped when:
 *   - the model key is no longer present,
 *   - the model is no longer a record (e.g. replaced by a union), or
 *   - the field name is no longer one of the record's fields.
 */
function pruneMigrations(
  migrations: VersionMigrations | undefined,
  models: ModelDefs,
): VersionMigrations | undefined {
  if (migrations == null) return undefined;
  const result: VersionMigrations = {};
  for (const [modelKey, fields] of Object.entries(migrations)) {
    const def = models[modelKey];
    if (def == null || def.type !== "record") continue;
    const recordFields = def.fields;
    const kept: Record<string, FieldMigration> = {};
    for (const [fieldName, migration] of Object.entries(fields)) {
      if (fieldName in recordFields) {
        kept[fieldName] = migration;
      }
    }
    if (Object.keys(kept).length > 0) {
      result[modelKey] = kept;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

class SchemaVersionBuilderImpl<T extends ModelDefs> implements SchemaVersionBuilder<T> {
  private readonly models: T;
  private readonly version: number;
  private readonly previous: SchemaDefinition;
  private readonly _migrations: VersionMigrations | undefined;

  constructor(
    models: T,
    version: number,
    previous: SchemaDefinition,
    migrations?: VersionMigrations,
  ) {
    this.models = models;
    this.version = version;
    this.previous = previous;
    this._migrations = migrations;
  }

  addSchemaUpdate<S extends ModelDefs>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S> {
    // applyMigration returns both the merged models and any sugar-form
    // upgrades collected via `addField(name, type, { derivedFrom, forward })`.
    const { models, upgrades } = applyMigration(this.models, update.migration);
    const merged = mergeMigrations(
      this._migrations,
      upgrades as VersionMigrations | undefined,
    );
    // Reconcile against the new models: a later update that removes or
    // retypes a field must drop the prior step's stale migration entry.
    const pruned = pruneMigrations(merged, models);
    return new SchemaVersionBuilderImpl(models, this.version, this.previous, pruned);
  }

  withMigrations(migrations: VersionMigrations): SchemaVersionBuilder<T> {
    const merged = mergeMigrations(this._migrations, migrations);
    const pruned = pruneMigrations(merged, this.models);
    return new SchemaVersionBuilderImpl(this.models, this.version, this.previous, pruned);
  }

  build(): VersionedSchema<T> {
    return {
      type: "versioned",
      models: { ...this.models },
      version: this.version,
      previous: this.previous,
      ...(this._migrations != null ? { migrations: this._migrations } : {}),
    };
  }
}

export function nextSchema<T extends ModelDefs>(
  previous: SchemaDefinition<T>,
): SchemaVersionBuilder<T> {
  return new SchemaVersionBuilderImpl(previous.models, previous.version + 1, previous);
}
