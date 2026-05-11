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

import type { UnionVariantArg } from "./defineUnion.js";
import { resolveUnionVariantArg } from "./defineUnion.js";
import type { ModelDefs, RecordDef, RecordFields, UnionDef, UnionVariants } from "./defs.js";
import { ModelDefType } from "./defs.js";
import type { Ref, Type } from "./primitives.js";
import { isRecordDef, isUnionDef } from "./utils.js";

/** Soon to be deprecated - Use `ModelDefs` instead. */
export type ReturnedSchema = ModelDefs;

/** Soon to be deprecated - use `ModelDefs` instead. */
export type Schema<T extends ModelDefs> = T;

export type SchemaBuilder<T extends ModelDefs> = {
  [k in keyof T]: T[k] extends UnionDef<infer R> ? UnionBuilder<R>
    : T[k] extends RecordDef<infer R> ? RecordBuilder<R>
    : never;
};

/**
 * Upgrade options for a field whose value is derived from prior-version fields.
 * Supplied as the third argument to `addField`; surfaced by `applyMigration`
 * as part of `MigrationResult.upgrades`.
 *
 * Field upgrades are read-time lens transformations — old records are upgraded
 * on the fly when read, and only persisted in the new shape on subsequent
 * write. There is no migration pass over storage.
 */
export interface UpgradeFieldOptions<TNew, TOld extends Record<string, unknown>> {
  readonly derivedFrom: ReadonlyArray<keyof TOld & string>;
  readonly forward: (oldFields: TOld) => TNew;
}

/**
 * Options for a purely additive field. `default` is reserved for future
 * generator use (filling in defaults during read-time upgrade of older
 * records); today it is accepted but not threaded into the upgrade pipeline.
 */
export interface AdditiveFieldOptions<TNew> {
  readonly default?: TNew;
}

export type FieldOptions =
  | UpgradeFieldOptions<unknown, Record<string, unknown>>
  | AdditiveFieldOptions<unknown>;

function isUpgradeFieldOptions(
  options: FieldOptions,
): options is UpgradeFieldOptions<unknown, Record<string, unknown>> {
  return "forward" in options && typeof options.forward === "function";
}

export interface RecordBuilder<T extends Record<string, Type>> {
  // TODO: builders should support arg types and resolveModels to refs
  addField<const K extends string, V extends Type>(
    name: K,
    type: V,
    options?: FieldOptions,
  ): RecordBuilder<T & { [k in K]: V }>;
  removeField<K extends keyof T & string>(
    name: K,
  ): RecordBuilder<Omit<T, K>>;
  build(): RecordDef<T>;
}

export interface UnionBuilder<S extends UnionVariants> {
  // TODO: builders should support arg types and resolveModels to refs
  addVariant<const K extends string>(
    name: K,
    modelDefOrRef: UnionVariantArg,
  ): UnionBuilder<S & { [k in K]: Ref }>;
  build(): UnionDef<S>;
}

class UnionBuilderImpl<S extends UnionVariants> implements UnionBuilder<S> {
  private readonly name: string;
  private readonly docs: string | undefined;
  private readonly variants: S;
  constructor({ name, docs, variants }: UnionDef<S>) {
    this.name = name;
    this.docs = docs;
    this.variants = { ...variants };
  }
  addVariant<const K extends string>(
    variantName: K,
    modelDefOrRef: UnionVariantArg,
  ): UnionBuilder<S & Record<K, Ref>> {
    const ref: Ref = resolveUnionVariantArg(modelDefOrRef);
    const newVariants = { ...this.variants, [variantName]: ref };

    return new UnionBuilderImpl({
      type: ModelDefType.UNION,
      name: this.name,
      variants: newVariants,
      discriminant: "type",
    });
  }
  build(): UnionDef<S> {
    return {
      type: ModelDefType.UNION,
      variants: this.variants,
      discriminant: "type",
      name: this.name,
    };
  }
}

/**
 * Callback invoked at `RecordBuilder.build()` time when the builder has
 * collected one or more `FieldOptions` via `addField(...)`. The flusher is
 * responsible for associating the produced `RecordDef` with its options
 * (typically by identity in a `WeakMap`) so that a later harvest pass can
 * key results by the user's chosen output key.
 */
type UpgradeFlusher = (
  def: RecordDef,
  options: ReadonlyMap<string, FieldOptions>,
) => void;

class RecordBuilderImpl<T extends RecordFields> implements RecordBuilder<T> {
  private readonly name: string;
  private readonly fields: T;
  private readonly upgradeOptions: ReadonlyMap<string, FieldOptions>;
  private readonly flush: UpgradeFlusher | undefined;

  constructor(
    initialRecordDef: RecordDef<T>,
    flush: UpgradeFlusher | undefined,
    upgradeOptions?: ReadonlyMap<string, FieldOptions>,
  ) {
    this.name = initialRecordDef.name;
    this.fields = { ...initialRecordDef.fields };
    this.flush = flush;
    // Upgrade options only flow forward within a single migration callback —
    // they are NOT inherited from the prior version's RecordDef, because each
    // version's upgrades describe a specific version transition.
    this.upgradeOptions = new Map<string, FieldOptions>(upgradeOptions ?? []);
  }

  // TODO: resolve field value from arg instead
  addField<const K extends string, const V extends Type>(
    name: K,
    value: V,
    options?: FieldOptions,
  ): RecordBuilder<T & Record<K, V>> {
    const next = new Map(this.upgradeOptions);
    if (options != null) {
      next.set(name, options);
    }
    return new RecordBuilderImpl(
      {
        type: ModelDefType.RECORD,
        name: this.name,
        fields: { ...this.fields, [name]: value },
        docs: "",
      },
      this.flush,
      next,
    );
  }

  removeField<K extends keyof T & string>(
    name: K,
  ): RecordBuilder<Omit<T, K>> {
    const { [name]: _removed, ...rest } = this.fields;
    const next = new Map(this.upgradeOptions);
    next.delete(name);
    return new RecordBuilderImpl(
      {
        type: ModelDefType.RECORD,
        name: this.name,
        fields: rest as RecordFields,
        docs: "",
      },
      this.flush,
      next,
    ) as unknown as RecordBuilder<Omit<T, K>>;
  }

  build(): RecordDef<T> {
    const result: RecordDef<T> = {
      type: ModelDefType.RECORD,
      name: this.name,
      fields: this.fields,
      docs: "",
    };
    if (this.flush != null && this.upgradeOptions.size > 0) {
      this.flush(result, this.upgradeOptions);
    }
    return result;
  }
}

function makeBuilders<T extends ModelDefs>(
  models: T,
  flush: UpgradeFlusher | undefined,
): SchemaBuilder<T> {
  const builders = {} as SchemaBuilder<T>;
  for (const key in models) {
    const v = models[key];
    if (isRecordDef(v)) {
      builders[key] = new RecordBuilderImpl(v, flush) as unknown as SchemaBuilder<T>[typeof key];
    } else if (isUnionDef(v)) {
      builders[key] = new UnionBuilderImpl(v) as unknown as SchemaBuilder<T>[typeof key];
    }
  }
  return builders;
}

/** Per-model field migrations: `[modelKey][fieldName]` → upgrade options. */
export type FieldUpgrades = Record<
  string,
  Record<string, UpgradeFieldOptions<unknown, Record<string, unknown>>>
>;

export interface MigrationResult<M extends ModelDefs> {
  readonly models: M;
  readonly upgrades?: FieldUpgrades;
}

/**
 * Lower-level entry point that returns both the merged models AND any
 * `UpgradeFieldOptions` collected via `addField(name, type, options)` during
 * the migration callback. Used by `addSchemaUpdate` to fold sugar-form
 * upgrades into a `VersionedSchema`'s migrations map.
 *
 * Upgrade options are tracked by built-`RecordDef` identity in a closure-
 * scoped `WeakMap`, so harvesting uses the user's chosen output key (i.e.,
 * a record renamed in the migration callback gets its upgrade keyed under
 * the new name).
 */
export function applyMigration<
  const T extends ModelDefs,
  const S extends ModelDefs,
>(
  models: T,
  migration: (schema: SchemaBuilder<T>) => S,
): MigrationResult<T & S> {
  const optionsByDef = new WeakMap<RecordDef, ReadonlyMap<string, FieldOptions>>();
  const builders = makeBuilders(models, (def, options) => {
    optionsByDef.set(def, options);
  });
  const merged = { ...models, ...migration(builders) } as T & S;

  const upgrades: FieldUpgrades = {};
  for (const [modelKey, def] of Object.entries(merged)) {
    if (!isRecordDef(def)) continue;
    const opts = optionsByDef.get(def);
    if (opts == null) continue;
    const fieldEntries: Record<
      string,
      UpgradeFieldOptions<unknown, Record<string, unknown>>
    > = {};
    for (const [fieldName, options] of opts) {
      if (isUpgradeFieldOptions(options)) {
        fieldEntries[fieldName] = options;
      }
    }
    if (Object.keys(fieldEntries).length > 0) {
      upgrades[modelKey] = fieldEntries;
    }
  }

  return {
    models: merged,
    upgrades: Object.keys(upgrades).length > 0 ? upgrades : undefined,
  };
}

export function defineMigration<
  const T extends ModelDefs,
  const S extends ModelDefs,
>(
  models: T,
  migration: (schema: SchemaBuilder<T>) => S,
): T & S {
  return applyMigration(models, migration).models;
}
