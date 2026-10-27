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
 * afterwards breaks existing data. Returns the names it checked, for tests.
 */
export function assertSdkNamesUnique(
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

  // Each name the SDK uses, and what uses it, e.g. "KnownShape" -> 'union "Shape" (Known type)'.
  const usedNames = new Map<string, string>();
  const useName = (name: string, usedFor: string): void => {
    const alreadyUsedFor = usedNames.get(name);
    // The same thing can be added again, e.g. once per version. Only a different thing clashes.
    if (alreadyUsedFor != null && alreadyUsedFor !== usedFor) {
      throw new Error(
        `The generated SDK would use the name "${name}" for both ${alreadyUsedFor} and ${usedFor}.`
          + " Rename a model so the names differ.",
      );
    }
    usedNames.set(name, usedFor);
  };

  for (const name of RESERVED_SDK_NAMES) {
    useName(name, "the SDK itself");
  }

  // types.ts, schema.ts and models.ts: unversioned names from the latest version.
  const latestIr = chain[chain.length - 1]!.ir;
  for (const [modelKey, modelDef] of Object.entries(latestIr.models)) {
    const model = `${modelDef.type} "${modelKey}"`; // e.g. 'record "Foo"'
    useName(modelKey, model);
    useName(modelName(modelKey), `${model} (Model)`);
    useName(schemaName(modelKey), `${model} (Zod schema)`);
    if (modelDef.type !== "union") continue;

    useName(knownTypeName(modelKey), `${model} (Known type)`);
    useName(narrowKnownFunctionName(modelKey), `${model} (narrowKnown function)`);
    useName(upgradesName(modelKey), `${model} (upgrades)`);
    for (const variantKey of Object.keys(modelDef.union.variants)) {
      const variant = `variant "${variantKey}" of ${model}`;
      const variantName = unionVariantName(modelKey, variantKey);
      useName(variantName, variant);
      useName(modelName(variantName), `${variant} (Model)`);
      useName(schemaName(variantName), `${variant} (Zod schema)`);
    }
    useName(
      unionVariantName(modelKey, UNKNOWN_UNION_VARIANT),
      `variant "${UNKNOWN_UNION_VARIANT}" of ${model}`,
    );
  }

  // types_vN.ts, writeTypes_vN.ts, schema_vN.ts and versionedDocRef.ts, for each supported version.
  for (const { version, ir } of chain) {
    if (version < minVersion) continue;

    useName(versionedDocRefName(version), "the SDK itself");
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      const model = `${modelDef.type} "${modelKey}"`;
      const typeName = versionedTypeName(modelKey, version);
      const zodName = versionedSchemaName(modelKey, version);
      useName(typeName, `${model} (v${version} type)`);
      useName(zodName, `${model} (v${version} Zod schema)`);
      if (modelDef.type === "record") {
        useName(versionedWriteTypeName(modelKey, version), `${model} (v${version} write type)`);
        continue;
      }

      useName(knownTypeName(typeName), `${model} (v${version} Known type)`);
      useName(narrowKnownFunctionName(typeName), `${model} (v${version} narrowKnown function)`);
      const { discriminant, variants } = modelDef.union;
      for (const variantKey of [...Object.keys(variants), UNKNOWN_UNION_VARIANT]) {
        const variant = `variant "${variantKey}" of ${model}`;
        const variantType = unionVariantName(typeName, variantKey);
        useName(variantType, `${variant} (v${version} type)`);
        useName(typeGuardName(variantType), `${variant} (v${version} type guard)`);
        useName(unionVariantName(zodName, variantKey), `${variant} (v${version} Zod schema)`);
      }

      // A variant's type is its record's fields (or `value` for any other variant) plus the
      // discriminant, so a field named like the discriminant would appear twice.
      for (const [variantKey, targetKey] of Object.entries(variants)) {
        const target = ir.models[targetKey];
        const fields = target?.type === "record"
          ? target.record.fields.map(field => field.key)
          : ["value"];
        if (fields.includes(discriminant)) {
          throw new Error(
            `The generated type "${unionVariantName(typeName, variantKey)}" would have two`
              + ` properties named "${discriminant}". Rename the discriminant of ${model}.`,
          );
        }
      }
    }
  }

  // _internal/: every record in any version of the chain.
  for (const { version, ir } of chain) {
    for (const [modelKey, modelDef] of Object.entries(ir.models)) {
      if (modelDef.type !== "record") continue;

      const model = `record "${modelKey}"`;
      useName(internalTypeName(modelKey), `${model} (internal type)`);
      useName(versionedInternalTypeName(modelKey, version), `${model} (v${version} internal type)`);
      useName(internalSchemaName(modelKey), `${model} (internal Zod schema)`);
      useName(upgradesName(modelKey), `${model} (upgrades)`);
    }
  }

  return usedNames;
}
