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
  minorVersion?: number;
  ir: IRealTimeDocumentSchema;
  migrations?: SerializedVersionMigrations;
}

export interface ResolvedIrChain {
  chain: VersionedIrEntry[];
  latestVersion: number;
  minVersion: number;
  /**
   * The chain before `collapseChainToMajors`, with every minor version. Upgrade steps come from
   * this, so a field added in a minor version gets its own step. Defaults to `chain`.
   */
  stepChain?: VersionedIrEntry[];
}

export interface IrChainPayload {
  comment?: string;
  latestVersion: number;
  minSupportedVersion?: number;
  owningApplicationId?: string;
  chain: VersionedIrEntry[];
}

export interface FullSchemaVersion {
  readonly major: number;
  readonly minor: number;
}

export function getEntryMinorVersion(entry: VersionedIrEntry): number {
  return entry.minorVersion ?? 0;
}

export function formatSchemaVersion(major: number, minor: number): string {
  return minor > 0 ? `${major}.${minor}` : `${major}`;
}

function formatEntryVersion(entry: VersionedIrEntry): string {
  return formatSchemaVersion(entry.version, getEntryMinorVersion(entry));
}

function getSchemaMinorVersion(schema: SchemaDefinition): number {
  return schema.type === "versioned" ? schema.minorVersion ?? 0 : 0;
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

  return schemas.map((schema, index): VersionedIrEntry => {
    const minorVersion = getSchemaMinorVersion(schema);
    return {
      version: schema.version,
      ...(minorVersion > 0 ? { minorVersion } : {}),
      ir: convertSchemaToIr(
        schema.models,
        { version: schema.version, name: identity.name, description: identity.description },
        provenances[index]!,
      ),
      ...(schema.type === "versioned"
        ? { migrations: serializeMigrations(schema.migrations) }
        : {}),
    };
  });
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
 * newest. The first version (major and minor) where a model key or record field
 * appears is the version stamped into IR metadata.
 */
function deriveProvenance(schemas: readonly SchemaDefinition[]): SchemaProvenance[] {
  const firstModelVersions = new Map<string, FullSchemaVersion>();
  const firstFieldVersions = new Map<string, Map<string, FullSchemaVersion>>();

  return schemas.map(schema => {
    const currentVersion = { major: schema.version, minor: getSchemaMinorVersion(schema) };
    const modelVersions: Record<string, number> = {};
    const modelMinorVersions: Record<string, number> = {};
    const fieldVersions: Record<string, Record<string, number>> = {};
    const fieldMinorVersions: Record<string, Record<string, number>> = {};

    for (const [modelKey, modelDef] of Object.entries(schema.models)) {
      if (!firstModelVersions.has(modelKey)) {
        firstModelVersions.set(modelKey, currentVersion);
      }
      const modelVersion = firstModelVersions.get(modelKey)!;
      modelVersions[modelKey] = modelVersion.major;
      if (modelVersion.minor > 0) {
        modelMinorVersions[modelKey] = modelVersion.minor;
      }

      if (modelDef.type !== "record") continue;

      let fieldVersionsForModel = firstFieldVersions.get(modelKey);
      if (fieldVersionsForModel == null) {
        fieldVersionsForModel = new Map<string, FullSchemaVersion>();
        firstFieldVersions.set(modelKey, fieldVersionsForModel);
      }

      const fields: Record<string, number> = {};
      const minorFields: Record<string, number> = {};
      for (const fieldKey of Object.keys(modelDef.fields)) {
        if (!fieldVersionsForModel.has(fieldKey)) {
          fieldVersionsForModel.set(fieldKey, currentVersion);
        }
        const fieldVersion = fieldVersionsForModel.get(fieldKey)!;
        fields[fieldKey] = fieldVersion.major;
        if (fieldVersion.minor > 0) {
          minorFields[fieldKey] = fieldVersion.minor;
        }
      }

      if (Object.keys(fields).length > 0) {
        fieldVersions[modelKey] = fields;
      }
      if (Object.keys(minorFields).length > 0) {
        fieldMinorVersions[modelKey] = minorFields;
      }
    }

    return {
      fieldVersions,
      modelVersions,
      fieldMinorVersions,
      modelMinorVersions,
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
        + `(available versions: ${chain.map(formatEntryVersion).join(", ")})`,
    );
  }

  return {
    latestVersion,
    minVersion: minSupportedVersion ?? latestVersion,
  };
}

function capVersionedIrChain(
  chain: VersionedIrEntry[],
  maxVersion: FullSchemaVersion | undefined,
): VersionedIrEntry[] {
  if (maxVersion == null) {
    return chain;
  }

  const maxIndex = chain.findIndex(c =>
    c.version === maxVersion.major && getEntryMinorVersion(c) === maxVersion.minor
  );
  if (maxIndex === -1) {
    throw new Error(
      `maxVersion ${
        formatSchemaVersion(maxVersion.major, maxVersion.minor)
      } is not in the schema chain `
        + `(available versions: ${chain.map(formatEntryVersion).join(", ")})`,
    );
  }

  // The chain is in version order, so everything up to the match is at or below it.
  return chain.slice(0, maxIndex + 1);
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
  maxVersion?: FullSchemaVersion,
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
 * Collapse the chain to one entry per major version, for SDK generation.
 *
 * Generated types are per major: each major uses its last minor's IR, so the SDK
 * includes every field known for that major. Migrations are merged from every
 * entry of the major, because they only live on the entry that introduced them.
 */
export function collapseChainToMajors(chain: VersionedIrEntry[]): VersionedIrEntry[] {
  const collapsed: VersionedIrEntry[] = [];
  for (const entry of chain) {
    const previous = collapsed[collapsed.length - 1];
    const migrations = previous?.version === entry.version
      ? mergeMigrations(previous.migrations, entry.migrations)
      : entry.migrations;
    const collapsedEntry: VersionedIrEntry = {
      version: entry.version,
      ir: entry.ir,
      ...(migrations != null ? { migrations } : {}),
    };
    if (previous?.version === entry.version) {
      collapsed[collapsed.length - 1] = collapsedEntry;
    } else {
      collapsed.push(collapsedEntry);
    }
  }
  return collapsed;
}

function mergeMigrations(
  base: SerializedVersionMigrations | undefined,
  override: SerializedVersionMigrations | undefined,
): SerializedVersionMigrations | undefined {
  if (base == null) return override;
  if (override == null) return base;
  const result: SerializedVersionMigrations = { ...base };
  for (const [modelKey, fields] of Object.entries(override)) {
    result[modelKey] = { ...result[modelKey], ...fields };
  }
  return result;
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
 * Pass the full chain (with minor versions) so fields added in a minor count.
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

/** Upgrade function key for a step: `v2` for 2.0, `v2_1` for 2.1. Matches the runtime read lens. */
export function upgradeStepKey(major: number, minor: number): string {
  return minor > 0 ? `v${major}_${minor}` : `v${major}`;
}
