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
 * Supplied as the third argument to `addField`; harvested by `addSchemaUpdate`.
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

/**
 * Symbol-keyed side channel on `RecordDef`. Set by `RecordBuilderImpl.build()`
 * when the builder collected `UpgradeFieldOptions` via `addField(...)`. The
 * `SchemaVersionBuilder` harvests this map during `addSchemaUpdate` and merges
 * it into the schema's per-version upgrade map.
 *
 * Stored as a non-enumerable property so it does not leak through object
 * spreads or JSON serialization.
 */
export const __fieldUpgradeMeta: unique symbol = Symbol.for(
  "@palantir/pack.schema/__fieldUpgradeMeta",
);

function isUpgradeFieldOptions(
  options: FieldOptions,
): options is UpgradeFieldOptions<unknown, Record<string, unknown>> {
  return "forward" in options && typeof options.forward === "function";
}

/**
 * Read the side-channel upgrade metadata from a `RecordDef`, if any was
 * attached at build time.
 */
export function getFieldUpgradeMeta(
  def: RecordDef,
): Map<string, FieldOptions> | undefined {
  const value = (def as unknown as Record<symbol, unknown>)[__fieldUpgradeMeta];
  return value instanceof Map ? value as Map<string, FieldOptions> : undefined;
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

class RecordBuilderImpl<T extends RecordFields> implements RecordBuilder<T> {
  private readonly name: string;
  private readonly fields: T;
  private readonly upgradeOptions: ReadonlyMap<string, FieldOptions>;

  constructor(
    initialRecordDef: RecordDef<T>,
    upgradeOptions?: ReadonlyMap<string, FieldOptions>,
  ) {
    this.name = initialRecordDef.name;
    this.fields = { ...initialRecordDef.fields };
    // Upgrade options only flow forward within a single defineMigration
    // callback — they are NOT inherited from the prior version's RecordDef,
    // because each version's upgrades describe a specific version transition.
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
    if (this.upgradeOptions.size > 0) {
      Object.defineProperty(result, __fieldUpgradeMeta, {
        value: new Map(this.upgradeOptions),
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
    return result;
  }
}

export function defineMigration<
  const T extends ModelDefs,
  const S extends ModelDefs,
>(
  models: T,
  migration: (schema: SchemaBuilder<T>) => S,
): T & S {
  const builders = {} as SchemaBuilder<T>;

  for (const key in models) {
    const v = models[key];

    if (isRecordDef(v)) {
      const recordBuilder = new RecordBuilderImpl(v);
      builders[key] = recordBuilder as unknown as SchemaBuilder<T>[typeof key];
    } else if (isUnionDef(v)) {
      const unionBuilder = new UnionBuilderImpl(v);
      builders[key] = unionBuilder as unknown as SchemaBuilder<T>[typeof key];
    }
  }

  return {
    ...models,
    ...migration(builders),
  };
}

/**
 * Walk a `ModelDefs` and harvest any side-channel upgrade metadata into a
 * nested map keyed by `[modelName][fieldName]`. Records without metadata are
 * skipped. Used by `SchemaVersionBuilder` to fold sugar from
 * `addField(name, type, { derivedFrom, forward })` into the resulting schema's
 * per-version upgrades.
 */
export function harvestFieldUpgrades(
  models: ModelDefs,
):
  | Record<string, Record<string, UpgradeFieldOptions<unknown, Record<string, unknown>>>>
  | undefined
{
  const result: Record<
    string,
    Record<string, UpgradeFieldOptions<unknown, Record<string, unknown>>>
  > = {};
  for (const [modelKey, modelDef] of Object.entries(models)) {
    if (!isRecordDef(modelDef)) continue;
    const meta = getFieldUpgradeMeta(modelDef);
    if (meta == null) continue;
    const fieldEntries: Record<
      string,
      UpgradeFieldOptions<unknown, Record<string, unknown>>
    > = {};
    for (const [fieldName, options] of meta) {
      if (isUpgradeFieldOptions(options)) {
        fieldEntries[fieldName] = options;
      }
    }
    if (Object.keys(fieldEntries).length > 0) {
      result[modelKey] = fieldEntries;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Return a copy of `models` where every `RecordDef`'s side-channel upgrade
 * metadata has been dropped. Used by `SchemaVersionBuilder` after harvesting
 * options into the per-version upgrade map, so that a subsequent
 * `addSchemaUpdate` does not re-harvest the same options.
 *
 * Records without metadata are returned by reference (preserves identity for
 * unchanged models across versions).
 */
export function stripFieldUpgradeMeta<T extends ModelDefs>(models: T): T {
  const result = {} as { [K in keyof T]: T[K] };
  for (const key in models) {
    const def = models[key];
    if (isRecordDef(def) && getFieldUpgradeMeta(def) != null) {
      // Spread strips the non-enumerable metadata symbol.
      result[key] = { ...def } as T[typeof key];
    } else {
      result[key] = def;
    }
  }
  return result;
}
