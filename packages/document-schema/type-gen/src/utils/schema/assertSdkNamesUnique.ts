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

import { UNKNOWN_UNION_VARIANT } from "@palantir/pack.document-schema.model-types";
import type { IModelDef } from "../../lib/pack-docschema-api/pack-docschema-ir/index.js";
import {
  resolveMinVersion,
  stripDeprecatedFieldsForSdk,
  type VersionedIrEntry,
} from "./resolveSchemaChain.js";
import {
  internalSchemaName,
  internalTypeName,
  knownTypeName,
  modelName,
  narrowKnownFunctionName,
  RESERVED_SDK_NAMES,
  schemaName,
  typeGuardName,
  unionVariantName,
  upgradesName,
  versionedDocRefName,
  versionedInternalTypeName,
  versionedSchemaName,
  versionedTypeName,
  versionedWriteTypeName,
} from "./runtimeSchema.js";

/**
 * Throw if the generated SDK would use one name for two different things, so a clash fails
 * here with a clear message instead of as a TypeScript error in the generated files. Run it
 * before a schema is deployed: model keys are stored in documents, so renaming a model
 * afterwards breaks existing data.
 */
export function assertSdkNamesUnique(
  chain: VersionedIrEntry[],
  minSupportedVersion: number | undefined,
): void {
  listSdkNames(chain, minSupportedVersion);
}

/**
 * Every top-level name in the generated SDK, mapped to what it is, e.g.
 * `"KnownShape"` -> `union "Shape" (Known type)`. Throws if two different things share a
 * name, or if a generated type would have two properties with the same name.
 */
export function listSdkNames(
  irChain: VersionedIrEntry[],
  minSupportedVersion: number | undefined,
): ReadonlyMap<string, string> {
  const { minVersion } = resolveMinVersion(irChain, minSupportedVersion);
  // The SDK leaves out deprecated fields, so check the fields it actually generates.
  const chain = stripDeprecatedFieldsForSdk(irChain);

  // Generated names end in "_v<version>", so a model key like "Foo_v2" passes today but
  // clashes with record "Foo" once the schema reaches v2, when it can no longer be renamed.
  for (const { ir } of chain) {
    for (const modelKey of Object.keys(ir.models)) {
      if (/_v\d/.test(modelKey)) {
        throw new Error(
          `Model "${modelKey}" can't contain "_v" followed by a number. The generated SDK adds`
            + ` "_v<version>" to names, so this one could clash in a later schema version.`
            + " Rename the model.",
        );
      }
    }
  }
  const names = new Map<string, string>();
  const add = (name: string, owner: string): void => {
    const existing = names.get(name);
    if (existing != null && existing !== owner) {
      throw new Error(
        `The generated SDK would use the name "${name}" for both ${existing} and ${owner}.`
          + " Rename a model so the names differ.",
      );
    }
    names.set(name, owner);
  };

  for (const name of RESERVED_SDK_NAMES) {
    add(name, "the SDK itself");
  }

  // types.ts, schema.ts and models.ts: unversioned names from the latest version.
  const latestIr = chain[chain.length - 1]!.ir;
  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    const model = describeModel(modelKey, modelDef);
    add(modelKey, model);
    add(modelName(modelKey), `${model} (Model)`);
    add(schemaName(modelKey), `${model} (Zod schema)`);
    if (modelDef.type !== "union") continue;

    add(knownTypeName(modelKey), `${model} (Known type)`);
    add(narrowKnownFunctionName(modelKey), `${model} (narrowKnown function)`);
    add(upgradesName(modelKey), `${model} (upgrades)`);
    for (const variantKey of Object.keys(modelDef.union.variants)) {
      const variant = `variant "${variantKey}" of ${model}`;
      const variantName = unionVariantName(modelKey, variantKey);
      add(variantName, variant);
      add(modelName(variantName), `${variant} (Model)`);
      add(schemaName(variantName), `${variant} (Zod schema)`);
    }
    add(unionVariantName(modelKey, UNKNOWN_UNION_VARIANT), `the Unknown case of ${model}`);
  }

  // types_vN.ts, writeTypes_vN.ts, schema_vN.ts and versionedDocRef.ts, for each supported version.
  for (const { version, ir } of chain) {
    if (version < minVersion) continue;

    add(versionedDocRefName(version), "the SDK itself");
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      const model = describeModel(modelKey, modelDef);
      const typeName = versionedTypeName(modelKey, version);
      add(typeName, `${model} (v${version} type)`);
      add(versionedSchemaName(modelKey, version), `${model} (v${version} Zod schema)`);
      if (modelDef.type === "record") {
        add(versionedWriteTypeName(modelKey, version), `${model} (v${version} write type)`);
        assertPropertiesUnique(
          typeName,
          modelDef.record.fields.map(field => field.key),
          "Rename one of the fields.",
        );
        continue;
      }

      add(knownTypeName(typeName), `${model} (v${version} Known type)`);
      add(narrowKnownFunctionName(typeName), `${model} (v${version} narrowKnown function)`);
      const { discriminant, variants } = modelDef.union;
      const variantTypes = [
        ...Object.entries(variants).map(([variantKey, targetKey]) => {
          const target = ir.models[targetKey];
          const isRecord = target != null && target.type === "record";
          return {
            variantKey,
            owner: `variant "${variantKey}" of ${model}`,
            // A record variant extends the record; any other variant holds it in `value`.
            properties: [
              discriminant,
              ...(isRecord ? target.record.fields.map(field => field.key) : ["value"]),
            ],
            fix: isRecord
              ? `Rename the field in record "${targetKey}" or the discriminant of ${model}.`
              : `Rename the discriminant of ${model}.`,
          };
        }),
        {
          variantKey: UNKNOWN_UNION_VARIANT,
          owner: `the Unknown case of ${model}`,
          properties: [discriminant, "rawValue"],
          fix: `Rename the discriminant of ${model}.`,
        },
      ];
      for (const { variantKey, owner, properties, fix } of variantTypes) {
        const variantType = unionVariantName(typeName, variantKey);
        add(variantType, `${owner} (v${version} type)`);
        add(typeGuardName(variantType), `${owner} (v${version} type guard)`);
        add(
          unionVariantName(versionedSchemaName(modelKey, version), variantKey),
          `${owner} (v${version} Zod schema)`,
        );
        assertPropertiesUnique(variantType, properties, fix);
      }
    }
  }

  // _internal/: every record in any version of the chain.
  for (const { version, ir } of chain) {
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type !== "record") continue;

      const model = describeModel(modelKey, modelDef);
      add(internalTypeName(modelKey), `${model} (internal type)`);
      add(versionedInternalTypeName(modelKey, version), `${model} (v${version} internal type)`);
      add(internalSchemaName(modelKey), `${model} (internal Zod schema)`);
      add(upgradesName(modelKey), `${model} (upgrades)`);
    }
  }

  return names;
}

function describeModel(modelKey: string, modelDef: IModelDef): string {
  return `${modelDef.type} "${modelKey}"`;
}

function assertPropertiesUnique(typeName: string, properties: string[], fix: string): void {
  const seen = new Set<string>();
  for (const property of properties) {
    if (seen.has(property)) {
      throw new Error(
        `The generated type "${typeName}" would have two properties named "${property}". ${fix}`,
      );
    }
    seen.add(property);
  }
}
