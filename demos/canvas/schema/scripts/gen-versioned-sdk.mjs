#!/usr/bin/env node
/*
 * Generate versioned SDK artifacts for the canvas demo.
 * Run from demos/canvas/schema: node scripts/gen-versioned-sdk.mjs
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// Import generators from type-gen ESM build
const typeGen = await import("@palantir/pack.document-schema.type-gen");

const {
  generateVersionedTypesFromSchema,
  generateVersionedZodFromSchema,
  generateInternalFromSchema,
  generateModelMetadataFromSchema,
} = typeGen;

// Load the schema module
const schemaPath = path.resolve(import.meta.dirname, "../src/schema.mjs");
const schemaModule = await import(pathToFileURL(schemaPath).href);
const schema = schemaModule.default;

const MIN_SUPPORTED_VERSION = 1;
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../../sdk/src");

// Ensure output dirs exist
fs.mkdirSync(path.join(OUTPUT_DIR, "_internal"), { recursive: true });

// 1. Generate versioned types
console.log("Generating versioned types...");
const types = generateVersionedTypesFromSchema(schema, MIN_SUPPORTED_VERSION);

for (const [version, content] of types.readTypes) {
  const filePath = path.join(OUTPUT_DIR, `types_v${version}.ts`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  ✓ ${filePath}`);
}

for (const [version, content] of types.writeTypes) {
  const filePath = path.join(OUTPUT_DIR, `writeTypes_v${version}.ts`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  ✓ ${filePath}`);
}

const typesPath = path.join(OUTPUT_DIR, "types.ts");
fs.writeFileSync(typesPath, types.typesReExport, "utf8");
console.log(`  ✓ ${typesPath}`);

// 2. Generate versioned Zod schemas
console.log("Generating versioned Zod schemas...");
const zod = generateVersionedZodFromSchema(schema, MIN_SUPPORTED_VERSION);

for (const [version, content] of zod.zodSchemas) {
  const filePath = path.join(OUTPUT_DIR, `schema_v${version}.ts`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  ✓ ${filePath}`);
}

const schemaReExportPath = path.join(OUTPUT_DIR, "schema.ts");
fs.writeFileSync(schemaReExportPath, zod.schemaReExport, "utf8");
console.log(`  ✓ ${schemaReExportPath}`);

// 3. Generate internal files
console.log("Generating internal types and migrations...");
const internal = generateInternalFromSchema(schema);

fs.writeFileSync(path.join(OUTPUT_DIR, "_internal/types.ts"), internal.internalTypes, "utf8");
console.log(`  ✓ _internal/types.ts`);

fs.writeFileSync(path.join(OUTPUT_DIR, "_internal/migrations.ts"), internal.migrations, "utf8");
console.log(`  ✓ _internal/migrations.ts`);

fs.writeFileSync(path.join(OUTPUT_DIR, "_internal/schema.ts"), internal.internalSchema, "utf8");
console.log(`  ✓ _internal/schema.ts`);

// 4. Generate models.ts with version metadata + schema manifest
console.log("Generating model metadata...");
const metadata = generateModelMetadataFromSchema(schema, MIN_SUPPORTED_VERSION);

const modelsPath = path.join(OUTPUT_DIR, "models.ts");
fs.writeFileSync(modelsPath, metadata.modelsFile, "utf8");
console.log(`  ✓ ${modelsPath}`);

const manifestPath = path.join(OUTPUT_DIR, "schema-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(metadata.schemaManifest, null, 2) + "\n", "utf8");
console.log(`  ✓ ${manifestPath}`);

console.log("\n✅ Canvas SDK generated successfully!");
