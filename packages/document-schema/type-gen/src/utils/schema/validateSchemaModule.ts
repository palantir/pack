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

import type * as P from "@palantir/pack.schema";
import { z } from "zod";

// Re-export types from document-schema-api
export type * as P from "@palantir/pack.schema";
export type SchemaDef = P.RecordDef | P.UnionDef;
export type ReturnedSchema = Record<string, SchemaDef>;

// Create a deep validation schema for P.Type
const typeSchema: z.ZodType<P.Type> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("string") }),
    z.object({ type: z.literal("double") }),
    z.object({ type: z.literal("unknown") }),
    z.object({
      type: z.literal("ref"),
      refType: z.enum(["record", "union"]),
      name: z.string(),
    }),
    z.object({
      type: z.literal("array"),
      items: typeSchema,
    }),
    z.object({
      type: z.literal("optional"),
      item: typeSchema,
    }),
  ])
);

// RecordDef validation schema
const recordDefSchema: z.ZodType<P.RecordDef> = z.object({
  type: z.literal("record"),
  name: z.string(),
  docs: z.string().optional(),
  fields: z.record(z.string(), typeSchema),
});

// UnionDef validation schema
const unionDefSchema: z.ZodType<P.UnionDef> = z.object({
  type: z.literal("union"),
  name: z.string(),
  docs: z.string().optional(),
  discriminant: z.string(),
  variants: z.record(
    z.string(),
    z.object({
      type: z.literal("ref"),
      refType: z.enum(["record", "union"]),
      name: z.string(),
    }),
  ),
});

// Schema definition (RecordDef or UnionDef)
const schemaDefSchema: z.ZodType<SchemaDef> = z.union([
  recordDefSchema,
  unionDefSchema,
]);

// ReturnedSchema is a record of schema definitions
const returnedSchemaSchema: z.ZodType<ReturnedSchema> = z.record(z.string(), schemaDefSchema);

// Schema module export pattern - must have default export
const schemaModuleSchema = z.object({
  default: returnedSchemaSchema,
}).catchall(z.unknown());

/**
 * Strip symbol properties from an object so Zod's z.record(z.string(), …)
 * doesn't choke on internal symbol metadata (e.g. __schemaVersion).
 */
function stripSymbolKeys(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    result[key] = (obj as Record<string, unknown>)[key];
  }
  return result;
}

/**
 * Validates that a schema module export contains valid schema definitions
 */
export function validateSchemaModule(schemaModule: unknown): Record<string, unknown> {
  return schemaModuleSchema.parse(schemaModule);
}

/**
 * Validates and extracts a schema from a module export
 */
export function extractValidSchema(schemaModule: unknown): ReturnedSchema {
  const mod = schemaModule as Record<string, unknown>;
  const cleanModule = { ...mod, default: stripSymbolKeys(mod?.default) };
  validateSchemaModule(cleanModule);
  // Return the original schema (not the stripped copy) to preserve symbol
  // metadata (__schemaVersion, __previousSchema) needed for version chain walking.
  return mod.default as ReturnedSchema;
}

/**
 * Type guard for P.Type validation
 */
export function validateSchemaType(value: unknown): P.Type {
  return typeSchema.parse(value);
}

/**
 * Type guard for RecordDef validation
 */
export function validateRecordDef(value: unknown): P.RecordDef {
  return recordDefSchema.parse(value);
}

/**
 * Type guard for UnionDef validation
 */
export function validateUnionDef(value: unknown): P.UnionDef {
  return unionDefSchema.parse(value);
}
