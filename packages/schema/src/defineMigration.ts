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
 * Recursive literal-JSON type. Constrains schema-time `default` values to
 * data that JSON-serializes losslessly — no `Date`, `RegExp`, functions, class
 * instances, or `undefined`. Mirrors the `JsonValue` exported by
 * `@palantir/pack.document-schema.model-types`; kept local here to avoid a
 * package dependency from `pack.schema`.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Upgrade options for a field whose value is derived from prior-version fields.
 * Supplied as the third argument to `addField`; surfaced by `applyMigration`
 * as part of `MigrationResult.upgrades`.
 *
 * Forward functions are no longer authored at schema time — they are supplied
 * by the application at runtime via a typed `UpgradeFns` table. The schema only
 * declares the structural dependency (`derivedFrom`) and an optional literal
 * JSON `default` used when no source data exists.
 */
export interface UpgradeFieldOptions<TOld extends Record<string, unknown>> {
  readonly derivedFrom: ReadonlyArray<keyof TOld & string>;
  readonly default?: JsonValue;
}

/**
 * Options for a purely additive field. `default` is literal JSON only;
 * validated at `addField()` call time.
 */
export interface AdditiveFieldOptions {
  readonly default?: JsonValue;
}

export type FieldOptions =
  | UpgradeFieldOptions<Record<string, unknown>>
  | AdditiveFieldOptions;

/**
 * Recursively assert `value` is representable as literal JSON. Rejects `Date`,
 * `RegExp`, functions, class instances, symbol-keyed properties, `undefined`
 * (anywhere — top-level or nested), `symbol`, and `bigint`. Throws on the
 * first offending value, naming the path for debuggability.
 */
function assertJsonDefault(value: unknown, path: string): void {
  const t = typeof value;
  // Reject `undefined` before the null fast-path so that the `value == null`
  // shorthand below cannot accidentally accept it. (eslint's `eqeqeq` rule
  // bans `=== null` in this repo, but we still need to distinguish null from
  // undefined: null is valid JSON, undefined is not.)
  if (t === "undefined") {
    throw new Error(`Invalid JSON default at ${path}: undefined is not valid JSON`);
  }
  if (value == null) return;
  if (t === "string" || t === "number" || t === "boolean") return;
  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new Error(`Invalid JSON default at ${path}: ${t} is not valid JSON`);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertJsonDefault(value[i], `${path}[${i}]`);
    }
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto != null) {
    const ctorName = (value as { constructor?: { name?: string } }).constructor?.name
      ?? "non-plain object";
    throw new Error(`Invalid JSON default at ${path}: ${ctorName} is not valid JSON`);
  }
  if (Object.getOwnPropertySymbols(value as object).length > 0) {
    throw new Error(`Invalid JSON default at ${path}: symbol-keyed properties are not valid JSON`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertJsonDefault(v, `${path}.${k}`);
  }
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
 * Non-enumerable carrier property attached to a `RecordDef` by
 * `RecordBuilderImpl.build()` when the builder has collected one or more
 * `FieldOptions`. `applyMigration` reads this and then deletes the property,
 * so the `RecordDef` it returns is structurally clean (no extra keys, no
 * symbol-keyed metadata). Replaces the prior `WeakMap` indirection now that
 * options are pure JSON data rather than closures.
 */
const UPGRADE_OPTIONS_CARRIER = "__pack_upgrade_options__";

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
    if (options != null && "default" in options && options.default !== undefined) {
      assertJsonDefault(options.default, `addField("${name}").default`);
    }
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
      Object.defineProperty(result, UPGRADE_OPTIONS_CARRIER, {
        value: this.upgradeOptions,
        enumerable: false,
        configurable: true,
        writable: false,
      });
    }
    return result;
  }
}

function makeBuilders<T extends ModelDefs>(models: T): SchemaBuilder<T> {
  const builders = {} as SchemaBuilder<T>;
  for (const key in models) {
    const v = models[key];
    if (isRecordDef(v)) {
      builders[key] = new RecordBuilderImpl(v) as unknown as SchemaBuilder<T>[typeof key];
    } else if (isUnionDef(v)) {
      builders[key] = new UnionBuilderImpl(v) as unknown as SchemaBuilder<T>[typeof key];
    }
  }
  return builders;
}

/** Per-model field migrations: `[modelKey][fieldName]` → upgrade options. */
export type FieldUpgrades = Record<
  string,
  Record<string, UpgradeFieldOptions<Record<string, unknown>>>
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
 * Each `RecordBuilderImpl.build()` attaches its collected options to the
 * produced `RecordDef` via a non-enumerable carrier property; this function
 * walks the merged result, extracts the options keyed by the user's chosen
 * output key (so renames are handled), and strips the carrier so the returned
 * `RecordDef`s are structurally clean.
 */
export function applyMigration<
  const T extends ModelDefs,
  const S extends ModelDefs,
>(
  models: T,
  migration: (schema: SchemaBuilder<T>) => S,
): MigrationResult<T & S> {
  const builders = makeBuilders(models);
  const merged = { ...models, ...migration(builders) } as T & S;

  const upgrades: FieldUpgrades = {};
  for (const [modelKey, def] of Object.entries(merged)) {
    if (!isRecordDef(def)) continue;
    const carrier = def as unknown as Record<string, unknown>;
    const opts = carrier[UPGRADE_OPTIONS_CARRIER] as
      | ReadonlyMap<string, FieldOptions>
      | undefined;
    if (opts == null) continue;
    // Strip the carrier so the returned RecordDef is structurally clean.
    delete carrier[UPGRADE_OPTIONS_CARRIER];
    const fieldEntries: Record<
      string,
      UpgradeFieldOptions<Record<string, unknown>>
    > = {};
    for (const [fieldName, options] of opts) {
      // Only `UpgradeFieldOptions` (which declare `derivedFrom`) flow into the
      // upgrades map; `AdditiveFieldOptions` carry only a literal `default`
      // and have no read-time lens effect.
      if ("derivedFrom" in options) {
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
