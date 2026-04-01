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
import type { RecordDef } from "./defs.js";

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

export interface SchemaUpdate<S extends ReturnedSchema = ReturnedSchema> {
  readonly name: string;
  readonly migration: (schema: SchemaBuilder<any>) => S;
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
  migration: (schema: SchemaBuilder<any>) => S,
): SchemaUpdate<S> {
  return { name, migration };
}

// --- Schema version builder ---

interface AppliedUpdate {
  readonly name: string;
  readonly stage: MigrationStage;
  readonly migration: (schema: SchemaBuilder<any>) => ReturnedSchema;
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
      [...this.appliedUpdates, { name: update.name, stage, migration: update.migration as any }],
    ) as unknown as SchemaVersionBuilder<T & S>;
  }

  build(): VersionedSchema<T> {
    // Apply all updates via defineMigration
    let schema: ReturnedSchema = this.previous;
    for (const update of this.appliedUpdates) {
      schema = defineMigration(schema as any, update.migration) as any;
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

/** Check if an update is purely additive (no derivedFrom on any field). */
function isAdditiveUpdate(schema: ReturnedSchema, update: AppliedUpdate): boolean {
  // Apply the migration to see what it produces, then check for fieldMigrations
  // We check the schema directly — any RecordDef with fieldMigrations that have
  // non-empty derivedFrom means it's a transform migration
  for (const def of Object.values(schema)) {
    if (def.type === "record") {
      const recordDef = def as RecordDef;
      if (recordDef.fieldMigrations) {
        for (const meta of Object.values(recordDef.fieldMigrations)) {
          if (meta.derivedFrom.length > 0) {
            return false;
          }
        }
      }
    }
  }
  return true;
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
