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

import type { SchemaDefinition, VersionMigrations } from "@palantir/pack.schema";
import type {
  IModelDef,
  IRealTimeDocumentSchema,
} from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import { IModelDef as IModelDefCtor } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import type { SchemaProvenance } from "../steps/convertStepsToIr.js";
import { convertSchemaToIr } from "../steps/convertStepsToIr.js";

/** JSON-serializable form of a single field migration. */
export interface SerializedFieldMigration {
  readonly derivedFrom: readonly string[];
}

/** Serialized migrations keyed by `[recordModelName][fieldName]`. */
export type SerializedVersionMigrations = Record<
  string,
  Record<string, SerializedFieldMigration>
>;

export interface VersionedIrEntry {
  version: number;
  ir: IRealTimeDocumentSchema;
  migrations?: SerializedVersionMigrations;
}

export interface ResolvedIrChain {
  chain: VersionedIrEntry[];
  latestVersion: number;
  minVersion: number;
}

export interface IrChainPayload {
  comment?: string;
  latestVersion: number;
  minSupportedVersion?: number;
  owningApplicationId?: string;
  chain: VersionedIrEntry[];
}

export interface SchemaIdentity {
  readonly name?: string;
  readonly description?: string;
}

function collectVersionedIrChain(
  input: SchemaDefinition,
  identity: SchemaIdentity,
): VersionedIrEntry[] {
  const schemas = collectSchemaDefinitions(input);
  const provenances = deriveProvenance(schemas);

  return schemas.map((schema, index): VersionedIrEntry => ({
    version: schema.version,
    ir: convertSchemaToIr(
      schema.models,
      { version: schema.version, name: identity.name, description: identity.description },
      provenances[index]!,
    ),
    ...(schema.type === "versioned" ? { migrations: serializeMigrations(schema.migrations) } : {}),
  }));
}

function collectSchemaDefinitions(input: SchemaDefinition): SchemaDefinition[] {
  const schemas: SchemaDefinition[] = [];
  let current: SchemaDefinition = input;

  while (current.type === "versioned") {
    schemas.unshift(current);
    current = current.previous;
  }
  schemas.unshift(current);

  return schemas;
}

/**
 * Build field/model provenance by walking the version chain from oldest to
 * newest. The first version where a model key or record field appears is the
 * version stamped into IR metadata.
 */
function deriveProvenance(schemas: readonly SchemaDefinition[]): SchemaProvenance[] {
  const firstModelVersions = new Map<string, number>();
  const firstFieldVersions = new Map<string, Map<string, number>>();

  return schemas.map(schema => {
    const modelVersions: Record<string, number> = {};
    const fieldVersions: Record<string, Record<string, number>> = {};

    for (const [modelKey, modelDef] of Object.entries(schema.models)) {
      if (!firstModelVersions.has(modelKey)) {
        firstModelVersions.set(modelKey, schema.version);
      }
      modelVersions[modelKey] = firstModelVersions.get(modelKey)!;

      if (modelDef.type !== "record") continue;

      let fieldVersionsForModel = firstFieldVersions.get(modelKey);
      if (fieldVersionsForModel == null) {
        fieldVersionsForModel = new Map<string, number>();
        firstFieldVersions.set(modelKey, fieldVersionsForModel);
      }

      const fields: Record<string, number> = {};
      for (const fieldKey of Object.keys(modelDef.fields)) {
        if (!fieldVersionsForModel.has(fieldKey)) {
          fieldVersionsForModel.set(fieldKey, schema.version);
        }
        fields[fieldKey] = fieldVersionsForModel.get(fieldKey)!;
      }

      if (Object.keys(fields).length > 0) {
        fieldVersions[modelKey] = fields;
      }
    }

    return {
      fieldVersions,
      modelVersions,
      deprecations: "deprecations" in schema ? schema.deprecations : undefined,
    };
  });
}

/** Convert schema-builder migrations to their JSON-serializable form. */
function serializeMigrations(
  migrations: VersionMigrations | undefined,
): SerializedVersionMigrations | undefined {
  if (migrations == null) return undefined;
  const result: SerializedVersionMigrations = {};
  for (const [modelKey, fields] of Object.entries(migrations)) {
    const fieldEntries: Record<string, SerializedFieldMigration> = {};
    for (const [fieldName, migration] of Object.entries(fields)) {
      fieldEntries[fieldName] = {
        derivedFrom: [...migration.derivedFrom],
      };
    }
    result[modelKey] = fieldEntries;
  }
  return result;
}

/**
 * Validate `minSupportedVersion` against an already-resolved chain and return
 * the effective `minVersion`. Throws on invalid input.
 */
export function resolveMinVersion(
  chain: VersionedIrEntry[],
  minSupportedVersion: number | undefined,
): { latestVersion: number; minVersion: number } {
  if (chain.length === 0) {
    throw new Error("Schema version chain is empty");
  }

  const latestVersion = chain[chain.length - 1]!.version;

  if (minSupportedVersion != null && !chain.some(c => c.version === minSupportedVersion)) {
    throw new Error(
      `minSupportedVersion ${minSupportedVersion} is not in the schema chain `
        + `(available versions: ${chain.map(c => c.version).join(", ")})`,
    );
  }

  return {
    latestVersion,
    minVersion: minSupportedVersion ?? latestVersion,
  };
}

function capVersionedIrChain(
  chain: VersionedIrEntry[],
  maxVersion: number | undefined,
): VersionedIrEntry[] {
  if (maxVersion == null) {
    return chain;
  }

  if (!chain.some(c => c.version === maxVersion)) {
    throw new Error(
      `maxVersion ${maxVersion} is not in the schema chain `
        + `(available versions: ${chain.map(c => c.version).join(", ")})`,
    );
  }

  return chain.filter(c => c.version <= maxVersion);
}

/**
 * Collect the version chain and resolve min/latest versions.
 * Each version's models are converted to IR (IRealTimeDocumentSchema).
 * `identity.name` / `identity.description` are embedded into each chain entry's
 * IR; when omitted (e.g. test callers), `convertSchemaToIr` falls back to its
 * defaults.
 * Throws on empty chain or invalid minSupportedVersion.
 */
export function resolveSchemaChain(
  schema: SchemaDefinition,
  minSupportedVersion?: number,
  identity: SchemaIdentity = {},
  maxVersion?: number,
): ResolvedIrChain {
  const chain = capVersionedIrChain(collectVersionedIrChain(schema, identity), maxVersion);
  const { latestVersion, minVersion } = resolveMinVersion(chain, minSupportedVersion);
  return { chain, latestVersion, minVersion };
}

/**
 * Return a copy of the chain with deprecated fields removed from every version
 * at or after the version in which they were deprecated.
 *
 * The SDK type generators (`writeAllSdkFiles` and friends) must treat a
 * deprecated field exactly as a removed field: it disappears from that version's
 * public read/write types and per-version internal types, and the prev/curr diff
 * records it as a `removedField` (driving the upgrade lens). The field is still
 * collected into the all-versions `__Internal` type from earlier versions, which
 * are left untouched.
 */
export function stripDeprecatedFieldsForSdk(chain: VersionedIrEntry[]): VersionedIrEntry[] {
  return chain.map((entry): VersionedIrEntry => {
    const models: Record<string, IModelDef> = {};
    for (const [modelKey, modelDef] of Object.entries(entry.ir.models)) {
      if (modelDef.type === "record") {
        const fields = modelDef.record.fields.filter(field => {
          const dep = field.metadata.deprecatedFromVersion;
          return dep == null || entry.version < dep;
        });
        models[modelKey] = IModelDefCtor.record({ ...modelDef.record, fields });
      } else {
        models[modelKey] = modelDef;
      }
    }
    return { ...entry, ir: { ...entry.ir, models } };
  });
}

/**
 * True if the chain has any field that requires a runtime upgrade function.
 * Drives whether the generated SDK emits `DocumentModel` as a factory
 * (requires the app to supply typed upgrade functions) or as a const.
 *
 * Two cases trigger this:
 *  - A field declares `derivedFrom` with one or more source fields — the app
 *    must supply a forward function.
 *  - A required field is added in a version past v1 (no `derivedFrom`) — the
 *    app must supply a zero-arg thunk; `undefined` is not a legal value.
 *
 * Optional additive fields don't trigger it; the lens leaves them alone.
 */
export function chainNeedsUpgradeFns(chain: VersionedIrEntry[]): boolean {
  for (let i = 1; i < chain.length; i++) {
    const prevEntry = chain[i - 1]!;
    const currEntry = chain[i]!;
    for (const [modelKey, currModelDef] of Object.entries(currEntry.ir.models)) {
      if (currModelDef.type !== "record") continue;
      const prevModelDef = prevEntry.ir.models[modelKey];
      if (prevModelDef == null || prevModelDef.type !== "record") continue;
      const prevFields = new Set(prevModelDef.record.fields.map(f => f.key));
      const recordMigrations = currEntry.migrations?.[modelKey];
      for (const field of currModelDef.record.fields) {
        if (prevFields.has(field.key)) continue;
        const derivedFrom = recordMigrations?.[field.key]?.derivedFrom ?? [];
        if (derivedFrom.length > 0) return true;
        if (field.isOptional !== true) return true;
      }
    }
  }
  return false;
}
