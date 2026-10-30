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

import type { FieldDeprecation, SchemaBuilder } from "./defineMigration.js";
import { applyMigration } from "./defineMigration.js";
import type { ModelDefs } from "./defs.js";
import { isRecordDef, isUnionDef } from "./utils.js";

/** Version 1.0 of a schema, produced by {@link defineSchema}. */
export interface InitialSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "initial";
  readonly version: 1;
  readonly models: T;
}

export interface FieldMigration {
  readonly derivedFrom: readonly string[];
}

export type VersionMigrations = Record<string, Record<string, FieldMigration>>;

export interface FieldDeprecationInfo {
  readonly fromVersion: number;
  readonly message?: string;
}
export type VersionDeprecations = Record<string, Record<string, FieldDeprecationInfo>>;

/**
 * Any version after 1.0, produced by {@link nextSchema}. Links back to the `previous` version.
 * `version` is the major version; `minorVersion` is the minor version within it (absent means 0).
 */
export interface VersionedSchema<T extends ModelDefs = ModelDefs> {
  readonly type: "versioned";
  readonly models: T;
  readonly version: number;
  readonly minorVersion?: number;
  readonly previous: SchemaDefinition;
  readonly migrations?: VersionMigrations;
  readonly deprecations?: VersionDeprecations;
}

/** Any version of a schema: the {@link InitialSchema} (1.0) or a {@link VersionedSchema} (any later version). */
export type SchemaDefinition<T extends ModelDefs = ModelDefs> =
  | InitialSchema<T>
  | VersionedSchema<T>;

/**
 * Define version 1.0 of a schema from its initial set of models (records and
 * unions). Later versions extend it via {@link nextSchema} and
 * {@link defineSchemaUpdate}.
 *
 * @example
 * ```ts
 * const schemaV1 = defineSchema({ ShapeBox, NodeShape });
 * ```
 */
export function defineSchema<T extends ModelDefs>(models: T): InitialSchema<T> {
  return { type: "initial", version: 1, models };
}

/** A named schema change created by {@link defineSchemaUpdate} and applied with {@link SchemaVersionBuilder.addSchemaUpdate}. */
export interface SchemaUpdate<T extends ModelDefs, S extends ModelDefs> {
  readonly name: string;
  readonly migration: (schema: SchemaBuilder<T>) => S;
}

/**
 * Define a named, reusable schema change. The callback receives a
 * {@link SchemaBuilder} — one builder per existing model — and returns the
 * records and unions it changed or added.
 *
 * @param name - A stable identifier for this change, used to track the migration.
 * @example
 * ```ts
 * const splitColor = defineSchemaUpdate("splitColor", schema => {
 *   const ShapeBox = schema.ShapeBox
 *     .addField("fillColor", Optional(String), { derivedFrom: ["color"] })
 *     .deprecateField("color", "Use fillColor instead.")
 *     .build();
 *   return { ShapeBox };
 * });
 * ```
 */
export function defineSchemaUpdate<T extends ModelDefs, S extends ModelDefs>(
  name: string,
  migration: (schema: SchemaBuilder<T>) => S,
): SchemaUpdate<T, S> {
  return { name, migration };
}

/** Accumulates {@link SchemaUpdate}s onto the previous version. Create one with {@link nextSchema} and finish with `build()`. */
export interface SchemaVersionBuilder<T extends ModelDefs> {
  /** Apply a named change from {@link defineSchemaUpdate} to this version. */
  addSchemaUpdate<S extends ModelDefs>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S>;
  /** Attach explicit field migrations, supplementing the `derivedFrom` sugar on `addField`. */
  withMigrations(migrations: VersionMigrations): SchemaVersionBuilder<T>;
  /** Produce the finished {@link VersionedSchema}. In a minor version, throws for `derivedFrom`, new deprecations, and removed union variants. */
  build(): VersionedSchema<T>;
}

/** Options for {@link nextSchema}. */
export interface NextSchemaOptions {
  /**
   * `"major"` (default) bumps 1.x to 2.0. `"minor"` bumps 1.0 to 1.1 and may only add fields,
   * union variants, and new models, since apps on older minor versions of the same major keep
   * editing the document.
   */
  readonly bump?: "major" | "minor";
}

/**
 * Shallow-merge two `[modelKey][fieldName]` maps; `override` wins per field.
 * Used for both migrations (so `withMigrations` supplements `addField` sugar)
 * and deprecations (so each version's deprecations accumulate forward). The
 * maps are combined at both the model and field level.
 */
function mergeByModelField<V>(
  base: Record<string, Record<string, V>> | undefined,
  override: Record<string, Record<string, V>> | undefined,
): Record<string, Record<string, V>> | undefined {
  if (base == null) return override;
  if (override == null) return base;
  const result: Record<string, Record<string, V>> = { ...base };
  for (const [modelKey, fields] of Object.entries(override)) {
    result[modelKey] = { ...result[modelKey], ...fields };
  }
  return result;
}

/**
 * Drop migration entries that no longer correspond to a field on a record in
 * `models`. Required because `mergeByModelField` is monotonic — a later
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
    if (!isRecordDef(def)) continue;
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

/**
 * Convert the version-agnostic `FieldDeprecations` collected by `applyMigration`
 * (just `{ message? }`) into `VersionDeprecations` by stamping `fromVersion`.
 */
function stampDeprecationVersions(
  deprecations: Record<string, Record<string, FieldDeprecation>> | undefined,
  version: number,
): VersionDeprecations | undefined {
  if (deprecations == null) return undefined;
  const result: VersionDeprecations = {};
  for (const [modelKey, fields] of Object.entries(deprecations)) {
    const out: Record<string, FieldDeprecationInfo> = {};
    for (const [fieldName, info] of Object.entries(fields)) {
      out[fieldName] = { fromVersion: version, ...info };
    }
    result[modelKey] = out;
  }
  return result;
}

function getMinorVersion(schema: SchemaDefinition): number {
  return schema.type === "versioned" ? schema.minorVersion ?? 0 : 0;
}

/**
 * Throw for changes that break older apps on the same major, which keep editing during a minor:
 * - `derivedFrom`: older apps edit the source field and never update the derived one.
 * - New deprecations: newer apps stop writing a field that older apps still read.
 * - Removing union variants.
 * New fields, even required ones, are fine: their upgrade function fills them in on read. So are
 * new union variants: older apps read them as unknown and keep them when they save.
 */
function assertMinorVersionChanges(
  previous: SchemaDefinition,
  models: ModelDefs,
  migrations: VersionMigrations | undefined,
  deprecations: VersionDeprecations | undefined,
  versionLabel: string,
): void {
  const useMajor = "Use nextSchema(previous) for a major version instead.";
  const previousDeprecations = previous.type === "versioned" ? previous.deprecations : undefined;

  for (const [modelKey, previousDef] of Object.entries(previous.models)) {
    const def = models[modelKey];
    if (isUnionDef(previousDef) && isUnionDef(def)) {
      const removedVariants = Object.keys(previousDef.variants).filter(
        variantName => !Object.hasOwn(def.variants, variantName),
      );
      if (removedVariants.length > 0) {
        throw new Error(
          `Union "${modelKey}" cannot remove variants in minor version ${versionLabel}:`
            + ` ${removedVariants.join(", ")}.`,
        );
      }
    }
  }

  for (const [modelKey, fields] of Object.entries(migrations ?? {})) {
    for (const [fieldName, migration] of Object.entries(fields)) {
      if (migration.derivedFrom.length > 0) {
        throw new Error(
          `Field "${modelKey}.${fieldName}" cannot use derivedFrom in minor version ${versionLabel}. ${useMajor}`,
        );
      }
    }
  }

  for (const [modelKey, fields] of Object.entries(deprecations ?? {})) {
    for (const fieldName of Object.keys(fields)) {
      if (previousDeprecations?.[modelKey]?.[fieldName] == null) {
        throw new Error(
          `Field "${modelKey}.${fieldName}" cannot be deprecated in minor version ${versionLabel}. ${useMajor}`,
        );
      }
    }
  }
}

class SchemaVersionBuilderImpl<T extends ModelDefs> implements SchemaVersionBuilder<T> {
  private readonly models: T;
  private readonly version: number;
  private readonly minorVersion: number;
  private readonly previous: SchemaDefinition;
  private readonly _migrations: VersionMigrations | undefined;
  private readonly _deprecations: VersionDeprecations | undefined;

  constructor(
    models: T,
    version: number,
    minorVersion: number,
    previous: SchemaDefinition,
    migrations: VersionMigrations | undefined,
    deprecations?: VersionDeprecations,
  ) {
    this.models = models;
    this.version = version;
    this.minorVersion = minorVersion;
    this.previous = previous;
    this._migrations = migrations;
    this._deprecations = deprecations;
  }

  addSchemaUpdate<S extends ModelDefs>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S> {
    // applyMigration returns the merged models, any sugar-form upgrades from
    // `addField(name, type, { derivedFrom })`, and any `deprecateField` calls.
    const { models, upgrades, deprecations } = applyMigration(this.models, update.migration);
    const merged = mergeByModelField(
      this._migrations,
      upgrades as VersionMigrations | undefined,
    );
    // Reconcile against the new models: a later update that retypes a field
    // must drop the prior step's stale migration entry.
    const pruned = pruneMigrations(merged, models);
    // Attach this version to each freshly-deprecated field, then merge forward.
    const thisVersionDeprecations = stampDeprecationVersions(deprecations, this.version);
    const mergedDeprecations = mergeByModelField(this._deprecations, thisVersionDeprecations);
    return new SchemaVersionBuilderImpl(
      models,
      this.version,
      this.minorVersion,
      this.previous,
      pruned,
      mergedDeprecations,
    );
  }

  withMigrations(migrations: VersionMigrations): SchemaVersionBuilder<T> {
    const merged = mergeByModelField(this._migrations, migrations);
    const pruned = pruneMigrations(merged, this.models);
    return new SchemaVersionBuilderImpl(
      this.models,
      this.version,
      this.minorVersion,
      this.previous,
      pruned,
      this._deprecations,
    );
  }

  build(): VersionedSchema<T> {
    if (this.minorVersion > 0) {
      assertMinorVersionChanges(
        this.previous,
        this.models,
        this._migrations,
        this._deprecations,
        `${this.version}.${this.minorVersion}`,
      );
    }
    return {
      type: "versioned",
      models: { ...this.models },
      version: this.version,
      ...(this.minorVersion > 0 ? { minorVersion: this.minorVersion } : {}),
      previous: this.previous,
      ...(this._migrations != null ? { migrations: this._migrations } : {}),
      ...(this._deprecations != null ? { deprecations: this._deprecations } : {}),
    };
  }
}

/**
 * Start building the next version of a schema. Chain {@link SchemaVersionBuilder.addSchemaUpdate}
 * calls and finish with `build()`.
 *
 * By default this is a major version (1.x to 2.0). Pass `{ bump: "minor" }` for a minor version
 * (1.0 to 1.1), which may only add fields, union variants, and new models.
 *
 * @example
 * ```ts
 * const schemaV2 = nextSchema(schemaV1).addSchemaUpdate(splitColor).build();
 * const schemaV2_1 = nextSchema(schemaV2, { bump: "minor" }).addSchemaUpdate(addNote).build();
 * ```
 */
export function nextSchema<T extends ModelDefs>(
  previous: SchemaDefinition<T>,
  options: NextSchemaOptions = {},
): SchemaVersionBuilder<T> {
  const isMinor = options.bump === "minor";
  const version = isMinor ? previous.version : previous.version + 1;
  const minorVersion = isMinor ? getMinorVersion(previous) + 1 : 0;
  const deprecations = "deprecations" in previous ? previous.deprecations : undefined;
  return new SchemaVersionBuilderImpl(
    previous.models,
    version,
    minorVersion,
    previous,
    undefined,
    deprecations,
  );
}
