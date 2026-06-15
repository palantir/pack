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

import type {
  DocumentSchema,
  FieldDef,
  FieldTypeDescriptor,
  UnionUpgradeRegistry,
  UpgradeRegistry,
  UpgradeRegistryEntry,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata } from "@palantir/pack.document-schema.model-types";
import type * as Y from "yjs";

export const DOCUMENT_UPDATE_SCHEMA_VERSION_META_KEY =
  "@palantir/pack.state.core/documentUpdateSchemaVersion";

interface VersionContext {
  readonly defaultVersion: number;
  readonly upgrades?: UpgradeRegistryMap;
}

export function addDocumentUpdateSchemaVersionToTransaction(
  transaction: Y.Transaction,
  documentUpdateSchemaVersion: number,
): void {
  const currentVersion = getDocumentUpdateSchemaVersionFromTransaction(transaction);
  transaction.meta.set(
    DOCUMENT_UPDATE_SCHEMA_VERSION_META_KEY,
    Math.max(currentVersion ?? 0, documentUpdateSchemaVersion),
  );
}

export function getDocumentUpdateSchemaVersionFromTransaction(
  transaction: Y.Transaction,
): number | undefined {
  const value = transaction.meta.get(DOCUMENT_UPDATE_SCHEMA_VERSION_META_KEY);
  return typeof value === "number" ? value : undefined;
}

export function getModelDataSchemaVersion(
  schema: DocumentSchema,
  modelName: string,
  value: unknown,
): number {
  return getModelValueSchemaVersion(modelName, value, getVersionContext(schema));
}

export function getPartialModelDataSchemaVersion(
  schema: DocumentSchema,
  modelName: string,
  partialValue: unknown,
  currentValue?: unknown,
): number {
  return getModelValueSchemaVersion(
    modelName,
    partialValue,
    getVersionContext(schema),
    currentValue,
  );
}

function getVersionContext(schema: DocumentSchema): VersionContext {
  const schemaMeta = getMetadata(schema);
  return {
    defaultVersion: schemaMeta.minSupportedVersion ?? schemaMeta.version,
    upgrades: schemaMeta.upgrades,
  };
}

function getModelValueSchemaVersion(
  modelName: string,
  value: unknown,
  context: VersionContext,
  currentValue?: unknown,
): number {
  const entry = context.upgrades?.[modelName];
  if (entry == null) {
    return context.defaultVersion;
  }

  if (isUnionUpgradeRegistry(entry)) {
    const variantModelName = getUnionVariantModelName(entry, value)
      ?? getUnionVariantModelName(entry, currentValue);
    return variantModelName == null
      ? context.defaultVersion
      : getModelValueSchemaVersion(variantModelName, value, context, currentValue);
  }

  return getRecordFieldsSchemaVersion(modelName, value, context, currentValue);
}

function getRecordFieldsSchemaVersion(
  modelName: string,
  value: unknown,
  context: VersionContext,
  currentValue?: unknown,
): number {
  const entry = context.upgrades?.[modelName];
  if (!isRecordUpgradeRegistry(entry)) {
    return context.defaultVersion;
  }

  const state = toPlainObject(value);
  if (state == null) {
    return context.defaultVersion;
  }

  const currentState = toPlainObject(currentValue);
  let maxVersion = context.defaultVersion;
  for (const [fieldName, fieldValue] of Object.entries(state)) {
    const fieldDef = entry.allFields[fieldName];
    if (fieldDef == null) {
      continue;
    }

    maxVersion = Math.max(
      maxVersion,
      getFieldAddedInVersion(fieldDef, context.defaultVersion),
      getFieldTypeValueSchemaVersion(
        fieldDef.type,
        fieldValue,
        context,
        currentState?.[fieldName],
      ),
    );
  }
  return maxVersion;
}

function getFieldTypeValueSchemaVersion(
  descriptor: FieldTypeDescriptor,
  value: unknown,
  context: VersionContext,
  currentValue?: unknown,
): number {
  const normalizedDescriptor = unwrapOptional(descriptor);
  switch (normalizedDescriptor.kind) {
    case "modelRef":
      return getModelValueSchemaVersion(
        normalizedDescriptor.model,
        value,
        context,
        currentValue,
      );
    case "array":
      if (!Array.isArray(value)) {
        return context.defaultVersion;
      }
      {
        const currentItems = Array.isArray(currentValue) ? currentValue : undefined;
        return value.reduce<number>(
          (maxVersion, item, index) =>
            Math.max(
              maxVersion,
              getFieldTypeValueSchemaVersion(
                normalizedDescriptor.element,
                item,
                context,
                currentItems?.[index],
              ),
            ),
          context.defaultVersion,
        );
      }
    case "map": {
      const entries = toPlainObject(value);
      const currentEntries = toPlainObject(currentValue);
      if (entries == null) {
        return context.defaultVersion;
      }
      let maxVersion = context.defaultVersion;
      for (const [key, mapValue] of Object.entries(entries)) {
        maxVersion = Math.max(
          maxVersion,
          getFieldTypeValueSchemaVersion(
            normalizedDescriptor.value,
            mapValue,
            context,
            currentEntries?.[key],
          ),
        );
      }
      return maxVersion;
    }
    case "primitive":
      return context.defaultVersion;
    case "optional":
      return context.defaultVersion;
  }
}

function getUnionVariantModelName(
  entry: UnionUpgradeRegistry,
  value: unknown,
): string | undefined {
  const state = toPlainObject(value);
  if (state == null) {
    return undefined;
  }

  const variantKey = state[entry.discriminant];
  return typeof variantKey === "string" ? entry.variants[variantKey] : undefined;
}

function getFieldAddedInVersion(fieldDef: FieldDef, defaultVersion: number): number {
  return fieldDef.addedInVersion ?? defaultVersion;
}

function unwrapOptional(descriptor: FieldTypeDescriptor): FieldTypeDescriptor {
  let current = descriptor;
  while (current.kind === "optional") {
    current = current.inner;
  }
  return current;
}

function toPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function isRecordUpgradeRegistry(
  entry: UpgradeRegistryEntry | undefined,
): entry is UpgradeRegistry {
  return entry != null && "allFields" in entry;
}

function isUnionUpgradeRegistry(
  entry: UpgradeRegistryEntry | undefined,
): entry is UnionUpgradeRegistry {
  return entry != null && "variants" in entry;
}
