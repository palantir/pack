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
import { applyMigration } from "./defineMigration.js";
import type { FieldMigrationMetadata, RecordDef } from "./defs.js";

// --- Stage types ---

export type MigrationStage = "soak" | "adopt" | "finalize";

const STAGE_ORDER: Readonly<Record<MigrationStage, number>> = {
  soak: 1,
  adopt: 2,
  finalize: 3,
};

// --- Schema version metadata (carried on the schema object via symbol) ---

export const SchemaVersionMetadata: unique symbol = Symbol.for("pack.schema.versionMetadata");

export interface SchemaUpdateEntry {
  readonly name: string;
  readonly stage: MigrationStage;
  /** Whether this update contains only additive changes (no derivedFrom). */
  readonly additive: boolean;
}

export interface VersionedSchemaMetadata {
  readonly version: number;
  readonly updates: readonly SchemaUpdateEntry[];
  /** Full history: metadata from all previous versions, oldest first. */
  readonly history: readonly VersionedSchemaMetadata[];
}

export interface VersionedSchema<T extends ReturnedSchema = ReturnedSchema> {
  readonly schema: Schema<T>;
  readonly [SchemaVersionMetadata]: VersionedSchemaMetadata;
}

// --- SchemaUpdate definition ---

/** Migration function that accepts any schema builder shape. */
type SchemaMigrationFn<S extends ReturnedSchema = ReturnedSchema> = (
  schema: SchemaBuilder<ReturnedSchema>,
) => S;

export interface SchemaUpdate<S extends ReturnedSchema = ReturnedSchema> {
  readonly name: string;
  readonly migration: SchemaMigrationFn<S>;
}

/**
 * Define a stage-agnostic, reusable schema change. The same change object
 * is referenced at different stages across schema versions.
 *
 * The generic type S captures the shape of models returned by the migration.
 * The input schema type is inferred when the update is composed via addSchemaUpdate.
 */
export function defineSchemaUpdate<const S extends ReturnedSchema>(
  name: string,
  migration: SchemaMigrationFn<S>,
): SchemaUpdate<S> {
  return { name, migration };
}

// --- Schema version builder ---

interface AppliedUpdate {
  readonly name: string;
  readonly stage: MigrationStage;
  readonly migration: SchemaMigrationFn;
}

export interface SchemaVersionBuilder<T extends ReturnedSchema> {
  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<S>,
    stage: MigrationStage,
  ): SchemaVersionBuilder<T & S>;

  build(): VersionedSchema<T>;
}

class SchemaVersionBuilderImpl<T extends ReturnedSchema> implements SchemaVersionBuilder<T> {
  private readonly previous: Schema<T>;
  private readonly previousMetadata: VersionedSchemaMetadata | undefined;
  private readonly appliedUpdates: AppliedUpdate[];

  constructor(
    previous: Schema<T>,
    previousMetadata: VersionedSchemaMetadata | undefined,
    appliedUpdates: AppliedUpdate[] = [],
  ) {
    this.previous = previous;
    this.previousMetadata = previousMetadata;
    this.appliedUpdates = appliedUpdates;
  }

  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<S>,
    stage: MigrationStage,
  ): SchemaVersionBuilder<T & S> {
    // Validate stage progression
    const previousStage = this.findPreviousStage(update.name);
    if (previousStage != null) {
      if (STAGE_ORDER[stage] <= STAGE_ORDER[previousStage]) {
        throw new Error(
          `Schema update "${update.name}" cannot move from stage "${previousStage}" to "${stage}". `
            + `Stages must advance forward: soak → adopt → finalize.`,
        );
      }
    }

    // Check for duplicate in this version
    if (this.appliedUpdates.some(u => u.name === update.name)) {
      throw new Error(
        `Schema update "${update.name}" is already declared in this schema version.`,
      );
    }

    return new SchemaVersionBuilderImpl(
      this.previous,
      this.previousMetadata,
      [...this.appliedUpdates, {
        name: update.name,
        stage,
        migration: update.migration as SchemaMigrationFn,
      }],
    ) as unknown as SchemaVersionBuilder<T & S>;
  }

  build(): VersionedSchema<T> {
    // Apply all updates via applyMigration, tagging new fields with the update name
    let schema: ReturnedSchema = this.previous;
    for (const update of this.appliedUpdates) {
      const prevFieldMigrationKeys = collectFieldMigrationKeys(schema);
      schema = applyMigration(
        schema as Schema<ReturnedSchema>,
        update.migration,
      );
      stampUpdateName(schema, prevFieldMigrationKeys, update.name);
    }

    // Build carried-forward entries: previous updates not mentioned in this version
    const mentionedNames = new Set(this.appliedUpdates.map(u => u.name));
    const carriedForward: SchemaUpdateEntry[] = [];
    if (this.previousMetadata) {
      for (const prevUpdate of this.previousMetadata.updates) {
        if (!mentionedNames.has(prevUpdate.name)) {
          carriedForward.push(prevUpdate);
        }
      }
    }

    // Build current version's update entries
    const currentEntries: SchemaUpdateEntry[] = this.appliedUpdates.map(u => ({
      name: u.name,
      stage: u.stage,
      additive: isAdditiveUpdate(schema, u),
    }));

    const version = (this.previousMetadata?.version ?? 0) + 1;
    const history = this.previousMetadata
      ? [...this.previousMetadata.history, this.previousMetadata]
      : [];

    const metadata: VersionedSchemaMetadata = {
      version,
      updates: [...carriedForward, ...currentEntries],
      history,
    };

    return {
      schema: schema as Schema<T>,
      [SchemaVersionMetadata]: metadata,
    };
  }

  private findPreviousStage(updateName: string): MigrationStage | undefined {
    if (!this.previousMetadata) return undefined;
    const entry = this.previousMetadata.updates.find(u => u.name === updateName);
    return entry?.stage;
  }
}

/**
 * Create a new schema version by composing schema updates at specific stages.
 * The builder validates stage progression and supports implicit carry-forward.
 */
export function nextSchema<T extends ReturnedSchema>(
  previous: Schema<T> | VersionedSchema<T>,
): SchemaVersionBuilder<T> {
  const schema = isVersionedSchema(previous) ? previous.schema : previous;
  const metadata = isVersionedSchema(previous) ? previous[SchemaVersionMetadata] : undefined;
  return new SchemaVersionBuilderImpl(schema, metadata);
}

// --- Helpers ---

function isVersionedSchema(value: unknown): value is VersionedSchema {
  return value != null
    && typeof value === "object"
    && SchemaVersionMetadata in value;
}

/** Check if an update is purely additive (no derivedFrom on any field belonging to this update). */
function isAdditiveUpdate(schema: ReturnedSchema, update: AppliedUpdate): boolean {
  for (const def of Object.values(schema)) {
    if (def.type === "record") {
      const recordDef = def as RecordDef;
      if (recordDef.fieldMigrations) {
        for (const meta of Object.values(recordDef.fieldMigrations)) {
          if (meta.updateName === update.name && meta.derivedFrom.length > 0) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/** Collect all existing fieldMigration keys as "recordName.fieldName" for diffing. */
function collectFieldMigrationKeys(schema: ReturnedSchema): Set<string> {
  const keys = new Set<string>();
  for (const def of Object.values(schema)) {
    if (def.type === "record" && (def as RecordDef).fieldMigrations) {
      for (const fieldName of Object.keys((def as RecordDef).fieldMigrations!)) {
        keys.add(`${def.name}.${fieldName}`);
      }
    }
  }
  return keys;
}

/** Stamp updateName on any fieldMigrations entries not present in prevKeys. */
function stampUpdateName(schema: ReturnedSchema, prevKeys: Set<string>, updateName: string): void {
  for (const def of Object.values(schema)) {
    if (def.type === "record" && (def as RecordDef).fieldMigrations) {
      const recordDef = def as RecordDef;
      for (const [fieldName, meta] of Object.entries(recordDef.fieldMigrations!)) {
        if (!prevKeys.has(`${recordDef.name}.${fieldName}`) && meta.updateName == null) {
          (recordDef.fieldMigrations as Record<string, FieldMigrationMetadata>)[fieldName] = {
            ...meta,
            updateName,
          };
        }
      }
    }
  }
}

/**
 * Extract the VersionedSchemaMetadata from a schema, if present.
 */
export function getSchemaVersionMetadata(schema: unknown): VersionedSchemaMetadata | undefined {
  if (isVersionedSchema(schema)) {
    return schema[SchemaVersionMetadata];
  }
  return undefined;
}

/**
 * Create the initial schema version. This is the entry point for defining
 * a document type schema. The provided function returns the initial set of
 * record and union definitions.
 *
 * @example
 * const schemaV0 = S.initialSchema(() => ({
 *   Person: S.defineRecord("Person", { fields: { name: S.String } }),
 * }));
 */
export function initialSchema<const S extends ReturnedSchema>(
  fn: () => S,
): VersionedSchema<S> {
  // Wrap the plain function as a schema update that ignores the (empty) builder
  const update = defineSchemaUpdate<S>("initial", () => fn());
  const emptySchema = {} as Schema<Record<string, never>>;
  return nextSchema(emptySchema)
    .addSchemaUpdate(update, "finalize")
    .build() as VersionedSchema<S>;
}
