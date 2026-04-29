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

import type { IFieldTypeCollection } from "../../lib/pack-docschema-api/pack-docschema-ir/fieldTypeCollection.js";
import type { IFieldTypeUnion } from "../../lib/pack-docschema-api/pack-docschema-ir/fieldTypeUnion.js";
import type { IFieldValueUnion } from "../../lib/pack-docschema-api/pack-docschema-ir/fieldValueUnion.js";
import type { IRealTimeDocumentSchema } from "../../lib/pack-docschema-api/pack-docschema-ir/realTimeDocumentSchema.js";
import { versionedSchemaName, versionedTypeName } from "../schema/runtimeSchema.js";

// ---------------------------------------------------------------------------
// Public read-type TypeScript conversion
// ---------------------------------------------------------------------------

/**
 * Convert an IR field type to a TypeScript type string for public read types.
 */
export function convertFieldTypeToTypeScript(
  fieldType: IFieldTypeUnion,
  version?: number,
): string {
  switch (fieldType.type) {
    case "array":
      return `readonly ${convertCollectionValueToTypeScript(fieldType.array, version)}[]`;
    case "map":
    case "set":
      throw new Error(`${fieldType.type} is not yet supported in TypeScript generation`);
    case "value":
      return convertFieldValueToTypeScript(fieldType.value, version);
  }
}

function convertCollectionValueToTypeScript(
  collection: IFieldTypeCollection,
  version?: number,
): string {
  // allowNullValue is ignored in public read types (current behavior)
  return convertFieldValueToTypeScript(collection.value, version);
}

function convertFieldValueToTypeScript(
  value: IFieldValueUnion,
  version?: number,
): string {
  switch (value.type) {
    case "boolean":
      return "boolean";
    case "datetime":
      return "string";
    case "docRef":
      return "DocumentRef";
    case "double":
      return "number";
    case "integer":
      return "number";
    case "mediaRef":
      return "MediaRef";
    case "modelRef": {
      const modelKey = value.modelRef.modelTypes[0]!;
      return version != null ? versionedTypeName(modelKey, version) : modelKey;
    }
    case "object":
      return "ObjectRef";
    case "string":
      return "string";
    case "text":
      return "string";
    case "unmanagedJson":
      return "any";
    case "userRef":
      return "UserRef";
  }
}

// ---------------------------------------------------------------------------
// Zod schema conversion
// ---------------------------------------------------------------------------

/**
 * Convert an IR field type to a Zod schema string.
 */
export function convertFieldTypeToZodSchema(
  fieldType: IFieldTypeUnion,
  version?: number,
): string {
  switch (fieldType.type) {
    case "array": {
      const inner = convertFieldValueToZodSchema(fieldType.array.value, version);
      const optSuffix = fieldType.array.allowNullValue ? ".optional()" : "";
      return `z.array(${inner}${optSuffix})`;
    }
    case "map":
    case "set":
      throw new Error(`${fieldType.type} is not yet supported in Zod generation`);
    case "value":
      return convertFieldValueToZodSchema(fieldType.value, version);
  }
}

function convertFieldValueToZodSchema(
  value: IFieldValueUnion,
  version?: number,
): string {
  switch (value.type) {
    case "boolean":
      return "z.boolean()";
    case "datetime":
    case "docRef":
    case "mediaRef":
    case "object":
    case "string":
    case "text":
    case "userRef":
      return "z.string()";
    case "double":
    case "integer":
      return "z.number()";
    case "modelRef": {
      const modelKey = value.modelRef.modelTypes[0]!;
      const refSchemaName = version != null
        ? versionedSchemaName(modelKey, version)
        : `${modelKey}Schema`;
      const refTypeName = version != null ? versionedTypeName(modelKey, version) : modelKey;
      return `z.lazy((): ZodType<${refTypeName}> => ${refSchemaName})`;
    }
    case "unmanagedJson":
      return "z.unknown()";
  }
}

// ---------------------------------------------------------------------------
// Internal TypeScript conversion (refs → unknown, external refs → string)
// ---------------------------------------------------------------------------

/**
 * Convert an IR field type to a TypeScript string for internal types.
 */
export function convertFieldTypeToInternalTypeScript(
  fieldType: IFieldTypeUnion,
  isOptional: boolean,
): string {
  const base = convertFieldTypeToInternalTsInner(fieldType);
  if (isOptional) {
    return `(${base} | undefined)`;
  }
  return base;
}

function convertFieldTypeToInternalTsInner(fieldType: IFieldTypeUnion): string {
  switch (fieldType.type) {
    case "array": {
      const inner = convertCollectionValueToInternalTs(fieldType.array);
      const needsParens = inner.includes("|") || inner.startsWith("readonly ");
      const wrapped = needsParens ? `(${inner})` : inner;
      return `readonly ${wrapped}[]`;
    }
    case "map":
    case "set":
      throw new Error(`${fieldType.type} is not yet supported in internal TypeScript generation`);
    case "value":
      return convertFieldValueToInternalTs(fieldType.value);
  }
}

function convertCollectionValueToInternalTs(collection: IFieldTypeCollection): string {
  const base = convertFieldValueToInternalTs(collection.value);
  if (collection.allowNullValue) {
    return `(${base} | undefined)`;
  }
  return base;
}

function convertFieldValueToInternalTs(value: IFieldValueUnion): string {
  switch (value.type) {
    case "boolean":
      return "boolean";
    case "double":
    case "integer":
      return "number";
    case "datetime":
    case "docRef":
    case "mediaRef":
    case "object":
    case "string":
    case "text":
    case "userRef":
      return "string";
    case "modelRef":
    case "unmanagedJson":
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Internal Zod schema conversion
// ---------------------------------------------------------------------------

/**
 * Convert an IR field type to a Zod schema string for internal schemas.
 */
export function convertFieldTypeToInternalZod(
  fieldType: IFieldTypeUnion,
  isOptional: boolean,
): string {
  const base = convertFieldTypeToInternalZodInner(fieldType);
  if (isOptional) {
    if (base.endsWith(".optional()")) {
      return base;
    }
    return `${base}.optional()`;
  }
  return base;
}

function convertFieldTypeToInternalZodInner(fieldType: IFieldTypeUnion): string {
  switch (fieldType.type) {
    case "array": {
      const inner = convertCollectionValueToInternalZod(fieldType.array);
      return `z.array(${inner})`;
    }
    case "map":
    case "set":
      throw new Error(`${fieldType.type} is not yet supported in internal Zod generation`);
    case "value":
      return convertFieldValueToInternalZod(fieldType.value);
  }
}

function convertCollectionValueToInternalZod(collection: IFieldTypeCollection): string {
  const base = convertFieldValueToInternalZod(collection.value);
  if (collection.allowNullValue) {
    return `${base}.optional()`;
  }
  return base;
}

function convertFieldValueToInternalZod(value: IFieldValueUnion): string {
  switch (value.type) {
    case "boolean":
      return "z.boolean()";
    case "double":
    case "integer":
      return "z.number()";
    case "datetime":
    case "docRef":
    case "mediaRef":
    case "object":
    case "string":
    case "text":
    case "userRef":
      return "z.string()";
    case "modelRef":
    case "unmanagedJson":
      return "z.unknown()";
  }
}

// ---------------------------------------------------------------------------
// FieldTypeDescriptor conversion (for UpgradeLens)
// ---------------------------------------------------------------------------

/**
 * Convert an IR field type to a FieldTypeDescriptor source string for UpgradeLens.
 */
export function convertFieldTypeToDescriptor(
  fieldType: IFieldTypeUnion,
  isOptional: boolean,
): string {
  const base = convertFieldTypeToDescriptorInner(fieldType);
  if (isOptional) {
    return `{ kind: "optional", inner: ${base} }`;
  }
  return base;
}

function convertFieldTypeToDescriptorInner(fieldType: IFieldTypeUnion): string {
  switch (fieldType.type) {
    case "array": {
      const inner = convertCollectionValueToDescriptor(fieldType.array);
      return `{ kind: "array", element: ${inner} }`;
    }
    case "map":
    case "set":
      throw new Error(`${fieldType.type} is not yet supported in descriptor generation`);
    case "value":
      return convertFieldValueToDescriptor(fieldType.value);
  }
}

function convertCollectionValueToDescriptor(collection: IFieldTypeCollection): string {
  const base = convertFieldValueToDescriptor(collection.value);
  if (collection.allowNullValue) {
    return `{ kind: "optional", inner: ${base} }`;
  }
  return base;
}

function convertFieldValueToDescriptor(value: IFieldValueUnion): string {
  switch (value.type) {
    case "modelRef": {
      const modelKey = value.modelRef.modelTypes[0]!;
      return `{ kind: "modelRef", model: "${modelKey}" }`;
    }
    default:
      return `{ kind: "primitive" }`;
  }
}

// ---------------------------------------------------------------------------
// Ref type detection (for import generation)
// ---------------------------------------------------------------------------

/**
 * Detect which external ref types (DocumentRef, MediaRef, ObjectRef, UserRef)
 * are used anywhere in the IR schema.
 */
export function detectUsedRefTypes(ir: IRealTimeDocumentSchema): Set<string> {
  const refTypes = new Set<string>();

  for (const modelDef of Object.values(ir.models)) {
    if (modelDef.type === "record") {
      for (const field of modelDef.record.fields) {
        scanFieldTypeForRefs(field.fieldType, refTypes);
      }
    }
  }

  return refTypes;
}

function scanFieldTypeForRefs(fieldType: IFieldTypeUnion, out: Set<string>): void {
  switch (fieldType.type) {
    case "array":
      scanFieldValueForRefs(fieldType.array.value, out);
      break;
    case "value":
      scanFieldValueForRefs(fieldType.value, out);
      break;
  }
}

function scanFieldValueForRefs(value: IFieldValueUnion, out: Set<string>): void {
  switch (value.type) {
    case "docRef":
      out.add("DocumentRef");
      break;
    case "mediaRef":
      out.add("MediaRef");
      break;
    case "object":
      out.add("ObjectRef");
      break;
    case "userRef":
      out.add("UserRef");
      break;
  }
}

/**
 * Collect schema-local type references (versioned type names) from a field type.
 */
export function collectReferencedTypes(
  fieldType: IFieldTypeUnion,
  version: number,
  out: Set<string>,
): void {
  switch (fieldType.type) {
    case "array":
      collectReferencedValuesTypes(fieldType.array.value, version, out);
      break;
    case "value":
      collectReferencedValuesTypes(fieldType.value, version, out);
      break;
  }
}

function collectReferencedValuesTypes(
  value: IFieldValueUnion,
  version: number,
  out: Set<string>,
): void {
  if (value.type === "modelRef") {
    const modelKey = value.modelRef.modelTypes[0]!;
    out.add(versionedTypeName(modelKey, version));
  }
}

// ---------------------------------------------------------------------------
// External ref field type detection (for model metadata)
// ---------------------------------------------------------------------------

/**
 * Detect the external ref type (docRef, mediaRef, objectRef, userRef) of a field, if any.
 */
export function findExternalRefType(fieldType: IFieldTypeUnion): string | undefined {
  switch (fieldType.type) {
    case "array":
      return findExternalRefValueType(fieldType.array.value);
    case "value":
      return findExternalRefValueType(fieldType.value);
    default:
      return undefined;
  }
}

function findExternalRefValueType(value: IFieldValueUnion): string | undefined {
  switch (value.type) {
    case "docRef":
      return "docRef";
    case "mediaRef":
      return "mediaRef";
    case "object":
      return "objectRef";
    case "userRef":
      return "userRef";
    default:
      return undefined;
  }
}
