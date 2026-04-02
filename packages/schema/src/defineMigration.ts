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
import type {
  FieldMigrationMetadata,
  RecordDef,
  RecordFields,
  UnionDef,
  UnionVariants,
} from "./defs.js";
import { ModelDefType } from "./defs.js";
import type { Ref, Type } from "./primitives.js";
import { isRecordDef, isUnionDef } from "./utils.js";

export type ReturnedSchema = Record<string, RecordDef | UnionDef>;

export type Schema<T extends ReturnedSchema> = T;

export type SchemaBuilder<T extends ReturnedSchema> = {
  [k in keyof T]: T[k] extends UnionDef<infer R> ? UnionBuilder<R>
    : T[k] extends RecordDef<infer R> ? RecordBuilder<R>
    : never;
};

/**
 * Options for fields derived from existing fields (transform migrations).
 * Used with RecordBuilder.addField() to declare that a new field replaces
 * or is derived from one or more existing fields.
 */
export interface MigrationFieldOptions<TNew, TOldFields extends Record<string, Type>> {
  /** Fields this new field is derived from. */
  readonly derivedFrom: ReadonlyArray<Extract<keyof TOldFields, string>>;

  /**
   * Forward transform: computes the new field value from the old field(s).
   * Required inline — used by the read lens for old documents forever.
   */
  readonly forward: (oldFields: { readonly [K in keyof TOldFields]?: unknown }) => TNew;

  /**
   * Reverse transform: computes the old field value(s) from the new field.
   * Optional. Set to 'runtime' to indicate it will be provided at document service init.
   */
  readonly reverse?:
    | ((newValue: TNew) => Partial<Record<Extract<keyof TOldFields, string>, unknown>>)
    | "runtime";
}

/**
 * Options for purely additive fields (no dependency on existing fields).
 * Used with RecordBuilder.addField() to declare a default value.
 */
export interface AdditiveFieldOptions<TNew> {
  /**
   * Default value returned by the lens when the field is absent from the Y.Doc.
   * If provided, the generated read type marks this field as required (non-optional),
   * since the lens guarantees a value. The write type remains optional.
   */
  readonly default?: TNew;
}

/** Discriminator: options with derivedFrom are migration options. */
export type FieldOptions<TNew, TOldFields extends Record<string, Type>> =
  | MigrationFieldOptions<TNew, TOldFields>
  | AdditiveFieldOptions<TNew>;

/** Type guard to distinguish migration options from additive options. */
function isMigrationFieldOptions(
  options: FieldOptions<unknown, Record<string, Type>>,
): options is MigrationFieldOptions<unknown, Record<string, Type>> {
  return "derivedFrom" in options;
}

export interface RecordBuilder<T extends Record<string, Type>> {
  // TODO: builders should support arg types and resolveModels to refs
  addField<const K extends string, V extends Type>(
    name: K,
    type: V,
    options?: FieldOptions<unknown, T>,
  ): RecordBuilder<T & { [k in K]: V }>;

  /**
   * Mark a field for removal. The field follows the same soak/adopt/finalize
   * stage progression as addField, with removal-specific semantics:
   * - soak: field becomes Optional<T> in read type (deprecation period, still writable)
   * - adopt: field hidden from read type (no longer visible to app code)
   * - finalize: field hidden from read and write types (orphaned in Y.Doc forever)
   */
  removeField<K extends Extract<keyof T, string>>(name: K): RecordBuilder<Omit<T, K>>;

  build(): RecordDef<T>;
}

export interface UnionBuilder<S extends UnionVariants> {
  // TODO: builders should support arg types and resolveModels to refs
  addVariant<const K extends string>(
    name: K,
    modelDefOrRef: UnionVariantArg,
  ): UnionBuilder<Omit<S, K> & Record<K, Ref>>;
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
  ): UnionBuilder<Omit<S, K> & Record<K, Ref>> {
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
  private readonly docs: string | undefined;
  private readonly fields: T;
  private readonly migrations: Record<string, FieldMigrationMetadata>;
  private readonly removed: string[];

  constructor(initialRecordDef: RecordDef<T>) {
    this.name = initialRecordDef.name;
    this.docs = initialRecordDef.docs;
    this.fields = { ...initialRecordDef.fields };
    this.migrations = { ...initialRecordDef.fieldMigrations };
    this.removed = [...(initialRecordDef.removedFields ?? [])];
  }

  // TODO: resolve field value from arg instead
  addField<const K extends string, const V extends Type>(
    name: K,
    value: V,
    options?: FieldOptions<unknown, T>,
  ): RecordBuilder<T & Record<K, V>> {
    const newMigrations = { ...this.migrations };

    if (options != null) {
      const metadata: FieldMigrationMetadata = isMigrationFieldOptions(options)
        ? {
          derivedFrom: options.derivedFrom as readonly string[],
          forward: options.forward as (oldFields: Record<string, unknown>) => unknown,
          reverse: options.reverse as
            | ((newValue: unknown) => Record<string, unknown>)
            | "runtime"
            | undefined,
        }
        : {
          derivedFrom: [],
          forward: () => undefined,
          default: options.default,
        };
      newMigrations[name] = metadata;
    }

    return new RecordBuilderImpl({
      type: ModelDefType.RECORD,
      name: this.name,
      fields: { ...this.fields, [name]: value },
      fieldMigrations: newMigrations,
      removedFields: this.removed,
      docs: this.docs,
    });
  }

  removeField<K extends Extract<keyof T, string>>(name: K): RecordBuilder<Omit<T, K>> {
    const { [name]: _, ...remainingFields } = this.fields;
    return new RecordBuilderImpl({
      type: ModelDefType.RECORD,
      name: this.name,
      fields: remainingFields as Omit<T, K> & RecordFields,
      fieldMigrations: this.migrations,
      removedFields: [...this.removed, name],
      docs: this.docs,
    });
  }

  build(): RecordDef<T> {
    return {
      type: ModelDefType.RECORD,
      name: this.name,
      fields: this.fields,
      docs: this.docs,
      ...(Object.keys(this.migrations).length > 0 ? { fieldMigrations: this.migrations } : {}),
      ...(this.removed.length > 0 ? { removedFields: this.removed } : {}),
    };
  }
}

/**
 * Internal implementation shared by the deprecated public API and nextSchema.
 */
export function applyMigration<
  const T extends ReturnedSchema,
  const S extends ReturnedSchema,
>(
  previous: Schema<T>,
  migration: (schema: SchemaBuilder<T>) => S,
): Schema<T & S> {
  /**
   * Create a map of builders for the schema.
   *
   * Note about type assertions:
   * We use a type assertion here (SchemaBuilder<T>) because TypeScript cannot
   * track the relationship between the keys in the original schema and the
   * corresponding builder types. This is a fundamental limitation of TypeScript's
   * type system when dealing with dynamically constructed objects.
   *
   * The assertion is safe because:
   * 1. We're only adding keys that exist in the original schema
   * 2. For each key, we're creating a builder of the correct type
   * 3. The resulting object exactly matches the SchemaBuilder<T> type
   */
  const builders = {} as SchemaBuilder<T>;

  for (const key in previous) {
    const v = previous[key];

    // Use our type guards for safer type narrowing
    if (isRecordDef(v)) {
      // This assertion is necessary because TypeScript can't track the field types
      // through the dynamic property access and object construction
      const recordBuilder = new RecordBuilderImpl(v);
      builders[key] = recordBuilder as unknown as SchemaBuilder<T>[typeof key];
    } else if (isUnionDef(v)) {
      // Similar assertion needed for union builders
      const unionBuilder = new UnionBuilderImpl(v);
      builders[key] = unionBuilder as unknown as SchemaBuilder<T>[typeof key];
    }
  }

  return {
    ...previous,
    ...migration(builders),
  };
}

/**
 * @deprecated Use {@link initialSchema} to create the baseline schema and
 * {@link nextSchema} to build subsequent versions with schema updates.
 */
export function defineMigration<
  const T extends ReturnedSchema,
  const S extends ReturnedSchema,
>(
  previous: Schema<T>,
  migration: (schema: SchemaBuilder<T>) => S,
): Schema<T & S> {
  return applyMigration(previous, migration);
}
