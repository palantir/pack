## 1. Conceptual Model

### 1.1 Problem Statement

PACK applications use Yjs CRDTs for real-time collaborative editing. Multiple clients connected to the same document may temporarily run different SDK versions, each with a different understanding of the record schema. Additionally, documents created under old schemas may be opened months later by clients running much newer code.

The schema compatibility framework must handle two distinct concerns:

- **Client compatibility:** Two adjacent SDK versions can collaborate on the same document in real time without data loss or corruption.
- **Document forwards compatibility:** A record written under schema v1 can be read correctly by a client running schema vN, for any N > 1.

This spec is intended to primarily cover the cases where:
1. A forge or nucleus shipped app has clients with old and new code concurrently, via asset tracks or local dev mode.
	1. The expected version skew here would be one or two major versions.
2. A on-stack developed app has clients with old and new code concurrently, via on-stack or local development.

There are further cases such as:
1. Online, connected peers collaborating across apollo-managed stacks
	1. The expected version skew here could be three or four major versions, but bounded by the assumption that stacks are all online and receiving updates.
2. Offline, disconnected peers

To support these use-cases, we propose builders follow the same core model here, but additionally follow stronger recommendations.
These recommendations will be documented in the future, but examples of such recommendations would be:
- longer version soak times to match expected stack skew
- structuring the app to promote additive only changes
- avoiding schema changes where at all possible
- adopting flexible schemas that allow for features to be added without schema changes

### 1.2 Why Not Phased Migration

An earlier design proposed a phased migration model (soak/adopt/finalize) where each SDK version has fixed build-time behavior: soak clients dual-write old and new fields but read old; adopt clients dual-write but read new; finalize clients write only new. This approach has a fundamental flaw rooted in how Yjs resolves concurrent writes.

**Yjs resolves concurrent writes per-field, not per-transaction.** When two clients concurrently write to multiple fields, Yjs may resolve each field independently. This means coupled writes (e.g., writing both `color` and `fillColor` together) can become inconsistent:

```
Client A (dual-writing): color → 'blue', fillColor → 'blue'
Client B (dual-writing): color → 'red', fillColor → 'red'

Yjs might resolve to: color → 'blue', fillColor → 'red'
```

If Client A reads `color` and Client B reads `fillColor`, they see different values — exactly the inconsistency the migration was meant to prevent. This problem exists regardless of how the phases are arranged (read-first, write-first, or any combination), because any scheme that relies on coupled fields staying in sync across concurrent writes is inherently broken under per-field CRDT resolution.

### 1.3 Schema Versions

Each call to `nextSchema()` produces a new schema version with a **linear integer version number** (1, 2, 3, ...). This is a strictly incrementing counter representing the schema chain length.

```
schemaV1 → version 1
schemaV2 → version 2
schemaV3 → version 3
```

Migrations are defined between adjacent versions. The schema chain captures the full history of changes.

### 1.4 Client Compatibility Ranges

When generating a client SDK, the developer specifies which schema versions the client supports. This is a **contiguous range** `[minVersion, maxVersion]`:

- A client built against `[1, 1]` only supports schema version 1.
- A client built against `[1, 2]` supports both, and switches behavior at runtime based on the document's version.
- A client built against `[2, 2]` only supports schema version 2.

The typical release pattern is:

| Release | Client Version | Supported Schema Versions | Behavior |
|---------|---------------|--------------------------|----------|
| R1 | Client V1 | `[1, 1]` | Operates at schema v1 only |
| R2 | Client V2 | `[1, 2]` | Operates at v1 or v2, depending on document version |
| R3 | Client V3 | `[2, 2]` | Operates at schema v2 only |

Client V2 is the **transitional client**. It contains logic for both schema versions and checks the document's version at runtime to determine which to use. The codegen produces per-version typed APIs so this branching is type-safe.

### 1.5 Document Schema Version

Each document has a **schema version** — a single integer that determines which schema all connected clients operate at. This version is a one-way ratchet: it can only increase, never decrease.

**All clients connected to a document operate at the document's schema version.** There is never a case where two clients on the same document are reading/writing different field sets. This eliminates the dual-write consistency problem entirely.

**Version bumping is backend-driven.** Backpack tracks the compatibility ranges of all clients connected to a document. When all connected clients support a higher schema version, backpack bumps the document version. Once bumped, clients that don't support the new version can no longer connect.

The bump sequence for our example:

1. Document at v1. Client V1 `[1,1]` and Client V2 `[1,2]` are connected. Both operate at v1.
2. Client V1 disconnects (or is replaced by Client V2 on all tracks).
3. Backpack detects all connected clients support v2. Bumps document to v2.
4. Client V2 observes the version change and switches to v2 behavior.
5. Later, Client V3 `[2,2]` connects. It operates at v2.

### 1.6 Field Presence Model

The read lens operates on a **per-field presence** basis. For each field the current schema version expects, the lens asks:

1. **Is the field present in the Y.Doc?** If yes, use it directly.
2. **Is the field absent but derivable?** If a forward transform exists that can compute the field from other present fields, derive it.
3. **Is the field absent and not derivable?** Return `undefined` (the field is optional by construction).

This is needed because after a document version bump, existing records may still contain only old-version fields. The lens derives new-version fields on read, transparently. Over time, as records are updated at the new version, the old fields become orphaned and the new fields are populated directly.

### 1.7 Lens Model

The lens is a **pure read-time transformation**. When reading a record from the Y.Doc:

1. The raw Y.Map data is extracted (all fields, including unknown ones — passthrough).
2. For each migration step, the lens checks whether derived fields are absent and their source fields are present. If so, the forward transform is applied to compute the missing field.
3. For additive fields with a `default` value, if the field is absent, the default is returned.
4. For fields of record/union types, the lens recursively applies the appropriate sub-lens to nested data.
5. The full data is returned. Field visibility is governed by the TypeScript types (version-dependent), not by runtime key deletion.

The lens **never writes back** to the Y.Doc as a side effect of reading. Writes only occur when the application explicitly calls `updateRecord` or `setRecord`.

This is important for CRDT consistency. If the lens wrote derived fields back on read, it would generate Yjs mutations that propagate to all connected clients, creating unnecessary CRDT conflicts.

### 1.8 Read/Write Behavior

At any given moment, a client operates at the document's schema version. Its behavior is simple:

- **Read:** Apply the lens to the raw Y.Doc data, producing values shaped to the current version's types. The lens derives missing fields via forward transforms.
- **Write:** Write only the fields defined in the current version's write type. No dual-writing. Old-version fields are left as-is (orphaned) in the Y.Doc.

Because all clients on a document operate at the same version, there is no scenario where one client writes `color` while another reads `fillColor`. The version bump is the coordination point.

### 1.9 Additive Changes

For purely additive changes (new field with no dependency on existing fields), no migration machinery is needed. The field is simply optional starting from the version that adds it. The lens can supply a `default` value to make it non-optional in the read type.

Additive changes impose no compatibility constraints — a v1 client ignores unknown fields (passthrough), and a v2 client sees the new field (with lens-applied default if absent).

Additive changes can be introduced at any schema version without requiring a transitional client. A client built against `[N]` (where N adds the additive field) is immediately compatible with documents at version N-1 because the field is optional and the lens supplies a default.

### 1.10 Frontend/Backend Contract

**Frontend (this spec) is responsible for:**
- Defining the schema, migrations, and forward transforms
- Generating per-version types, write types, migration registries, and the read lens
- Including the client's supported schema version range on all wire messages
- Applying the lens to read old data correctly
- Providing a `useDocumentSchemaVersion()` hook for runtime version branching

**Backend (backpack) is responsible for:**
- Persisting the document schema version
- Tracking the supported version range of each connected client
- Computing when a document version can be bumped (all connected clients support the next version)
- Executing the version bump and notifying connected clients
- Rejecting connections from clients whose supported range doesn't include the document's current version
- Ensuring that record updates from clients don't include fields outside their operating version

**Wire protocol changes:** The client includes its `supportedSchemaVersions: [min, max]` on:
- Document load requests
- Document subscription requests
- Document update messages

The backend uses this to:
- Reject loads/subscriptions if the document version is outside the client's range
- Track which version ranges are connected for bump decisions
- Tag updates with the operating version (the document's current version at write time)

---

## 2. Schema DSL

### 2.1 RecordBuilder Extensions

The existing `RecordBuilder.addField(name, type)` method is extended with an optional migration options parameter:

```typescript
interface MigrationFieldOptions<TNew, TOld extends Record<string, unknown>> {
  /** Fields this new field is derived from. Presence of these fields determines derivation. */
  derivedFrom: (keyof TOld)[];

  /**
   * Forward transform: computes the new field value from the old field(s).
   * Used by the read lens for records that predate this field.
   */
  forward: (oldFields: Pick<TOld, keyof TOld>) => TNew;
}

interface AdditiveFieldOptions<TNew> {
  /**
   * Default value returned by the lens when the field is absent from the Y.Doc.
   * If provided, the generated read type marks this field as required (non-optional),
   * since the lens guarantees a value. The write type remains optional.
   */
  default?: TNew;
}

interface RecordBuilder<T extends Record<string, Type>> {
  addField<const K extends string, V extends Type>(
    name: K,
    type: V,
    options?: MigrationFieldOptions<InferType<V>, InferFields<T>>
           | AdditiveFieldOptions<InferType<V>>,
  ): RecordBuilder<T & { [k in K]: V }>;

  /**
   * Mark a field for removal in this schema version.
   * The field will not appear in the public read or write types for this version,
   * but remains in the Y.Doc (orphaned). The lens still knows about it for
   * forward transforms that derive new fields from it.
   */
  removeField<K extends keyof T>(name: K): RecordBuilder<Omit<T, K>>;

  build(): RecordDef<T>;
}
```

Note: `reverse` transforms are not needed. Since all clients on a document operate at the same version, there is no dual-writing. When operating at v1, clients write v1 fields directly. When operating at v2, clients write v2 fields directly.

### 2.2 Schema Updates

Schema changes are defined as standalone, reusable objects:

```typescript
/**
 * A standalone schema change definition. Describes what changes
 * between adjacent schema versions.
 */
function defineSchemaUpdate<T extends ReturnedSchema, S extends ReturnedSchema>(
  name: string,
  migration: (schema: SchemaBuilder<T>) => S,
): SchemaUpdate<T, S>;
```

### 2.3 Schema Version Builder

Each schema version is constructed by composing schema updates:

```typescript
interface SchemaVersionBuilder<T extends ReturnedSchema> {
  /**
   * Apply a schema update to this version.
   * Multiple updates can be composed into a single version.
   */
  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<T, S>,
  ): SchemaVersionBuilder<T & S>;

  build(): Schema<T>;
}

function nextSchema<T extends ReturnedSchema>(
  previous: Schema<T>,
): SchemaVersionBuilder<T>;
```

### 2.4 Client Configuration

The client codegen configuration specifies the supported version range:

```typescript
interface ClientCodegenConfig {
  /** The latest schema in the chain. Defines the full version history. */
  schema: Schema<any>;

  /**
   * Minimum schema version this client supports.
   * The codegen generates per-version types for all versions
   * from minSupportedVersion to the latest.
   * Defaults to the latest version (no backwards compatibility).
   */
  minSupportedVersion?: number;
}
```

For example, to generate a transitional client that supports v1 and v2:

```javascript
// codegen.config.mjs
export default {
  schema: schemaV2,
  minSupportedVersion: 1,
};
```

### 2.5 Canvas Demo Example

```javascript
// schema.mjs

// --- Schema v1 (baseline) ---
const schemaV1 = S.defineSchema({
  ShapeBox: S.defineRecord("ShapeBox", {
    fields: { left: S.Double, right: S.Double, top: S.Double, bottom: S.Double, color: S.Optional(S.String) },
  }),
  ShapeCircle: S.defineRecord("ShapeCircle", {
    fields: { cx: S.Double, cy: S.Double, radius: S.Double, color: S.Optional(S.String) },
  }),
  // ... NodeShape, ActivityEvent, PresenceEvent ...
});

// --- Schema change: color split ---
const addColorSplit = S.defineSchemaUpdate("addColorSplit", (schema) => {
  const ShapeBox = schema.ShapeBox
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .removeField("color")
    .build();

  const ShapeCircle = schema.ShapeCircle
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .removeField("color")
    .build();

  return { ShapeBox, ShapeCircle };
});

// --- Schema change: add opacity (additive) ---
const addOpacity = S.defineSchemaUpdate("addOpacity", (schema) => {
  const ShapeBox = schema.ShapeBox
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build();

  const ShapeCircle = schema.ShapeCircle
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build();

  return { ShapeBox, ShapeCircle };
});

// --- Schema v2: apply both changes ---
const schemaV2 = S.nextSchema(schemaV1)
  .addSchemaUpdate(addColorSplit)
  .addSchemaUpdate(addOpacity)
  .build();

export default schemaV2;
```

---

## 3. Code Generation Output

### 3.1 Per-Version Public Types

The codegen produces separate types for each supported schema version. When `minSupportedVersion: 1` and the latest is v2:

```typescript
// types_v1.ts

export interface ShapeBox_v1 {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;
}
```

```typescript
// types_v2.ts

export interface ShapeBox_v2 {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly opacity: number; // required — lens guarantees default of 1.0
}
```

A convenience re-export of the latest version types under unversioned names:

```typescript
// types.ts
export type { ShapeBox_v2 as ShapeBox } from './types_v2.js';
```

### 3.2 Per-Version Write Types

Each version gets its own write type. No migration group pairing — writes target exactly the fields in that version:

```typescript
// writeTypes_v1.ts

export type ShapeBoxUpdate_v1 = {
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly color?: string;
};
```

```typescript
// writeTypes_v2.ts

export type ShapeBoxUpdate_v2 = {
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly opacity?: number;
};
```

### 3.3 Internal Types

Contains **all** fields across all versions, used by the lens and mapper:

```typescript
// _internal/types.ts (not re-exported from index.ts)

/** Internal representation containing all fields across all schema versions. */
export interface ShapeBox__Internal {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;       // v1 field (removed in v2)
  readonly fillColor?: string;   // v2 field (derived from color)
  readonly strokeColor?: string; // v2 field (derived from color)
  readonly opacity?: number;     // v2 field (additive)
}
```

### 3.4 Zod Schemas

Generated Zod schemas use `.passthrough()` to preserve unknown fields through read/write cycles. Per-version schemas match the per-version types:

```typescript
// schema_v1.ts
export const ShapeBoxSchema_v1 = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  color: z.string().optional(),
}).passthrough() satisfies ZodType<ShapeBox_v1>;
```

```typescript
// schema_v2.ts
export const ShapeBoxSchema_v2 = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  fillColor: z.string().optional(),
  strokeColor: z.string().optional(),
  opacity: z.number(),
}).passthrough() satisfies ZodType<ShapeBox_v2>;
```

The internal schema includes all fields:

```typescript
// _internal/schema.ts
export const ShapeBoxInternalSchema = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  color: z.string().optional(),
  fillColor: z.string().optional(),
  strokeColor: z.string().optional(),
  opacity: z.number().optional(),
}).passthrough();
```

### 3.5 Migration Metadata

The codegen emits a migration registry that the lens consumes at runtime:

```typescript
// _internal/migrations.ts

import type { MigrationRegistry } from "@palantir/pack.state.core";

export const ShapeBoxMigrations: MigrationRegistry<"ShapeBox"> = {
  modelName: "ShapeBox",
  allFields: {
    bottom: { type: { kind: "primitive" } },
    left: { type: { kind: "primitive" } },
    right: { type: { kind: "primitive" } },
    top: { type: { kind: "primitive" } },
    color: { type: { kind: "optional", inner: { kind: "primitive" } } },
    fillColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
    strokeColor: { type: { kind: "optional", inner: { kind: "primitive" } } },
    opacity: { type: { kind: "optional", inner: { kind: "primitive" } }, default: 1.0 },
  },
  steps: [
    {
      name: "addColorSplit",
      addedInVersion: 2,
      fields: {
        fillColor: {
          derivedFrom: ["color"],
          forward: ({ color }) => color,
        },
        strokeColor: {
          derivedFrom: ["color"],
          forward: ({ color }) => color,
        },
      },
      removedFields: ["color"],
    },
    {
      name: "addOpacity",
      addedInVersion: 2,
      fields: {
        opacity: {
          derivedFrom: [],
          forward: () => undefined,
          default: 1.0,
        },
      },
    },
  ],
};
```

### 3.6 Model Metadata

The `DocumentModel` metadata includes the schema version range and migration registries:

```typescript
// models.ts

export const DocumentModel = {
  ShapeBox: ShapeBoxModel,
  // ...
  [Metadata]: {
    version: 2,                 // latest schema version (linear integer)
    minSupportedVersion: 1,     // earliest version this client can operate at
    migrations: {
      ShapeBox: ShapeBoxMigrations,
      ShapeCircle: ShapeCircleMigrations,
    },
  },
} as const satisfies DocumentSchema;
```

The codegen also produces a **schema manifest** for the backend: per-version field lists and the auto-derived compatibility matrix. The compatibility matrix is straightforward — two client versions are compatible on a document if and only if the document's version falls within both clients' supported ranges.

---

## 4. Runtime Lens System

### 4.1 Core Lens Interface

```typescript
// packages/state/core/src/migration/MigrationLens.ts

/** Type descriptor for a field, enabling recursive lens application. */
type FieldTypeDescriptor =
  | { kind: 'primitive' }
  | { kind: 'modelRef'; model: string }
  | { kind: 'array'; element: FieldTypeDescriptor }
  | { kind: 'map'; value: FieldTypeDescriptor }
  | { kind: 'optional'; inner: FieldTypeDescriptor };

interface FieldMigrationDef {
  derivedFrom: string[];
  forward: (oldFields: Record<string, unknown>) => unknown;
  /** Default value for additive fields (no derivation). */
  default?: unknown;
}

/** Type info for ALL fields in a record (not just migrated ones). */
interface FieldDef {
  type: FieldTypeDescriptor;
  /** Default value (for additive fields). */
  default?: unknown;
}

interface MigrationStepDef {
  /** Human-readable name of the schema update this step corresponds to. */
  name: string;
  /** The schema version that introduced this step. */
  addedInVersion: number;
  /** Fields added by this step. */
  fields: Record<string, FieldMigrationDef>;
  /** Fields removed by this step. */
  removedFields?: string[];
}

interface MigrationRegistry<ModelName extends string = string> {
  modelName: ModelName;
  /** Type info for all fields (enables recursive lens for nested model refs). */
  allFields: Record<string, FieldDef>;
  /** Migration steps, ordered. All steps are retained (lens needs forward transforms forever). */
  steps: MigrationStepDef[];
}
```

### 4.2 Read Lens

The read lens uses per-field presence checking. For each migration step, it checks whether derived fields are missing and computes them from source fields if possible:

```typescript
function applyReadLens(
  rawData: Record<string, unknown>,
  registry: MigrationRegistry,
  allRegistries: MigrationRegistryMap,
): Record<string, unknown> {
  let data = { ...rawData };

  // 1. Apply forward transforms for derived fields
  for (const step of registry.steps) {
    for (const [fieldName, def] of Object.entries(step.fields)) {
      if (def.derivedFrom.length === 0) continue; // additive, skip to defaults
      if (data[fieldName] !== undefined) continue; // already present, use as-is

      // Check if source fields are available to derive from
      const sourceFields: Record<string, unknown> = {};
      let canDerive = true;
      for (const src of def.derivedFrom) {
        if (data[src] === undefined) {
          canDerive = false;
          break;
        }
        sourceFields[src] = data[src];
      }

      if (canDerive) {
        data[fieldName] = def.forward(sourceFields);
      }
    }
  }

  // 2. Apply defaults for additive fields
  for (const step of registry.steps) {
    for (const [fieldName, def] of Object.entries(step.fields)) {
      if (data[fieldName] === undefined && def.default !== undefined) {
        data[fieldName] = def.default;
      }
    }
  }

  // 3. Recursively apply lens to nested model refs
  for (const [fieldName, fieldDef] of Object.entries(registry.allFields)) {
    if (data[fieldName] === undefined) continue;
    data[fieldName] = applyLensToValue(data[fieldName], fieldDef.type, allRegistries);
  }

  // Full data returned. TypeScript types govern field visibility — no runtime key deletion.
  return data;
}

/** Recursively apply lens to a value based on its type descriptor. */
function applyLensToValue(
  value: unknown,
  type: FieldTypeDescriptor,
  allRegistries: MigrationRegistryMap,
): unknown {
  switch (type.kind) {
    case 'primitive':
      return value;
    case 'modelRef': {
      const subRegistry = allRegistries[type.model];
      if (!subRegistry || subRegistry.steps.length === 0) return value;
      return applyReadLens(value as Record<string, unknown>, subRegistry, allRegistries);
    }
    case 'array':
      return (value as unknown[]).map(item =>
        applyLensToValue(item, type.element, allRegistries)
      );
    case 'map':
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) =>
          [k, applyLensToValue(v, type.value, allRegistries)]
        )
      );
    case 'optional':
      return value === undefined ? undefined : applyLensToValue(value, type.inner, allRegistries);
  }
}
```

### 4.3 Lens Chain Walking

When multiple migration steps exist across versions (e.g., v1→v2: `color → hexColor`, v2→v3: `hexColor → rgbaColor`), the read lens walks the steps in order. Because each step checks field presence and derives missing fields, chaining works naturally:

```typescript
// Record has only 'color'. Steps: [addHexColor (v2), addRgbaColor (v3)]
//
// Step 1 (addHexColor): 'hexColor' missing, 'color' present → derive hexColor
// Step 2 (addRgbaColor): 'rgbaColor' missing, 'hexColor' now present (just derived) → derive rgbaColor
//
// Each step sees the accumulated data from all previous steps.
```

---

## 5. YjsSchemaMapper Changes

### 5.1 Migration-Aware Mapper

`YjsSchemaMapper` becomes the interception point for the lens:

```typescript
// YjsSchemaMapper.ts

import { applyReadLens } from "../migration/MigrationLens.js";
import type { MigrationRegistry } from "../migration/types.js";

type MigrationRegistryMap = Record<string, MigrationRegistry>;

export function getRecordSnapshot(
  yDoc: Y.Doc,
  storageName: string,
  recordId: RecordId,
  migrations?: MigrationRegistryMap,
): unknown {
  const data = getRecordData(yDoc, storageName, recordId);
  if (!data) return undefined;

  const rawState = yMapToState(data);

  // Apply read lens if migrations exist for this model
  const registry = migrations?.[storageName];
  if (registry && registry.steps.length > 0) {
    return applyReadLens(rawState as Record<string, unknown>, registry, migrations);
  }

  return rawState;
}

export function updateRecord(
  yDoc: Y.Doc,
  storageName: string,
  recordId: RecordId,
  partialState: Partial<ModelData<Model>>,
  _migrations?: MigrationRegistryMap,
): boolean {
  // No write lens needed. The per-version write types ensure the client
  // only writes fields appropriate for its operating version.
  // ... existing update logic with partialState ...
}

export function setRecord(
  yDoc: Y.Doc,
  storageName: string,
  recordId: RecordId,
  state: ModelData<Model>,
  _migrations?: MigrationRegistryMap,
): boolean {
  // No write lens needed.
  // ... existing set logic with state ...
}
```

### 5.2 Passthrough on yMapToState

No changes needed. The existing `yMapToState` function already returns all fields from the Y.Map — passthrough behavior is inherent.

### 5.3 populateYMapFromState

No changes needed. Old fields are left as-is (orphaned) in the Y.Doc. The function continues to skip `undefined` values as before.

---

## 6. BaseYjsDocumentService Changes

### 6.1 Migration Registry Extraction

When creating an `InternalYjsDoc`, extract the migration registry from the `DocumentSchema` metadata:

```typescript
// BaseYjsDocumentService.ts

interface InternalYjsDoc {
  // ... existing fields ...
  readonly migrations?: MigrationRegistryMap;
}

protected createBaseInternalDoc(
  docRefId: DocumentRefId,
  schema: DocumentSchema,
): TDoc {
  const yDoc = new Y.Doc();
  initializeDocumentStructure(yDoc, schema);

  const schemaMeta = getMetadata(schema);
  const migrations = schemaMeta?.migrations;

  return {
    // ... existing fields ...
    migrations,
  } as TDoc;
}
```

### 6.2 Document Schema Version Tracking

The document service exposes the document's current schema version as an observable value:

```typescript
// BaseYjsDocumentService.ts

/** Returns the current schema version of the document. */
readonly getDocumentSchemaVersion = (
  docRefId: DocumentRefId,
): number => {
  // Read from document metadata (set by backend)
  return this.getInternalDoc(docRefId).documentSchemaVersion;
};

/** Subscribe to document schema version changes. */
readonly onDocumentSchemaVersionChange = (
  docRefId: DocumentRefId,
  callback: (version: number) => void,
): Unsubscribe => {
  // ... subscribe to version change events from backend ...
};
```

### 6.3 Passing Migrations Through

All calls to `YjsSchemaMapper` functions are updated to pass the migrations registry:

```typescript
readonly getRecordSnapshot = <M extends Model>(
  recordRef: RecordRef<M>,
): Promise<ModelData<M>> => {
  // ... existing ref resolution ...
  const snapshot = YjsSchemaMapper.getRecordSnapshot(
    internalDoc.yDoc,
    storageName,
    recordId,
    internalDoc.migrations,
  );
  return snapshot as ModelData<M>;
};
```

### 6.4 Client Schema Version Range on Wire

The document service reads the supported version range from `DocumentModel[Metadata]` and includes it on all outgoing wire messages:

```typescript
protected getClientSchemaVersionRange(schema: DocumentSchema): [number, number] {
  const meta = getMetadata(schema);
  return [meta.minSupportedVersion, meta.version];
}
```

Included on:
- **Document load requests** — backend rejects if document version is outside range
- **Document subscription requests** — backend rejects and prevents incompatible clients from receiving updates
- **Document update messages** — backend validates the update is consistent with the document's current version

---

## 7. React Hook Implications

### 7.1 useDocumentSchemaVersion

A new hook that exposes the document's current schema version:

```typescript
function useDocumentSchemaVersion(): number;
```

This is the primary branching point for developers writing transitional clients. It re-renders the component when the document version changes (e.g., when backpack bumps the version).

### 7.2 useRecord / useRecords

These hooks call `getRecordSnapshot` internally, which now applies the read lens. **No changes needed in the hooks themselves** — the lens is transparent.

The return type depends on which per-version type the developer uses. In a transitional client:

```typescript
function ShapeEditor({ shapeRef }: { shapeRef: RecordRef<ShapeBox> }) {
  const schemaVersion = useDocumentSchemaVersion();

  if (schemaVersion === 1) {
    return <ShapeEditor_v1 shapeRef={shapeRef} />;
  } else {
    return <ShapeEditor_v2 shapeRef={shapeRef} />;
  }
}

function ShapeEditor_v1({ shapeRef }) {
  const shape = useRecord<ShapeBox_v1>(shapeRef);
  // shape.color is available
  const handleColorChange = (color: string) => {
    updateRecord(shapeRef, { color } satisfies ShapeBoxUpdate_v1);
  };
  // ...
}

function ShapeEditor_v2({ shapeRef }) {
  const shape = useRecord<ShapeBox_v2>(shapeRef);
  // shape.fillColor and shape.strokeColor are available
  const handleFillChange = (fillColor: string) => {
    updateRecord(shapeRef, { fillColor } satisfies ShapeBoxUpdate_v2);
  };
  // ...
}
```

### 7.3 useOnDocActivityEvents

Activity events containing record snapshots are lens-applied on read, since activity event construction uses `getRecordSnapshot`. No changes needed.

---

## 8. Canvas Demo Migration

### 8.1 migration001: Fill/Stroke Split + Opacity

**Schema changes (v1 → v2):**

| Record | Field | Change Type | Forward Transform |
|--------|-------|-------------|-------------------|
| ShapeBox | `fillColor` | Derived from `color` | `({ color }) => color` |
| ShapeBox | `strokeColor` | Derived from `color` | `({ color }) => color` |
| ShapeBox | `opacity` | Additive (default: 1.0) | N/A |
| ShapeBox | `color` | Removed | N/A |
| ShapeCircle | `fillColor` | Derived from `color` | `({ color }) => color` |
| ShapeCircle | `strokeColor` | Derived from `color` | `({ color }) => color` |
| ShapeCircle | `opacity` | Additive (default: 1.0) | N/A |
| ShapeCircle | `color` | Removed | N/A |

Old `color` field is left as-is (orphaned) in the Y.Doc.

### 8.2 Release Sequence

**Release 1: Client V1 `[1, 1]`**
- App reads and writes `color` and `opacity`.
- No knowledge of `fillColor`/`strokeColor`.

**Release 2: Client V2 `[1, 2]` (transitional)**
- App checks `useDocumentSchemaVersion()`.
- When document is at v1: reads `color`, writes `color`. Same behavior as Client V1.
- When document is at v2: reads `fillColor`/`strokeColor` (lens derives from `color` for old records), writes `fillColor`/`strokeColor`.
- Backpack bumps document to v2 when no Client V1 instances remain.

**Release 3: Client V3 `[2, 2]`**
- App reads and writes `fillColor`, `strokeColor`, `opacity`.
- No v1 branching code. Clean, single-version logic.
- Lens still derives `fillColor`/`strokeColor` from `color` for old records that haven't been re-written.

### 8.3 Demo File Changes

| File | Change |
|------|--------|
| `demos/canvas/schema/src/schema.mjs` | Add color split and opacity updates, build schemaV2 |
| `demos/canvas/sdk/src/types_v1.ts` | Generated: v1 public types |
| `demos/canvas/sdk/src/types_v2.ts` | Generated: v2 public types |
| `demos/canvas/sdk/src/types.ts` | Re-exports v2 types as default |
| `demos/canvas/sdk/src/writeTypes_v1.ts` | Generated: v1 write types |
| `demos/canvas/sdk/src/writeTypes_v2.ts` | Generated: v2 write types |
| `demos/canvas/sdk/src/_internal/types.ts` | Generated: internal types with all fields |
| `demos/canvas/sdk/src/_internal/migrations.ts` | Generated: migration registry |
| `demos/canvas/sdk/src/_internal/schema.ts` | Generated: internal Zod schema with all fields |
| `demos/canvas/sdk/src/schema_v1.ts` | Generated: v1 Zod schema |
| `demos/canvas/sdk/src/schema_v2.ts` | Generated: v2 Zod schema |
| `demos/canvas/sdk/src/models.ts` | Updated: version metadata in `DocumentModel` |
| `demos/canvas/app/` | Updated: version-branching with per-version components |

---

## 9. Resolved Design Decisions

### 9.1 No Dual-Write

The core insight driving this spec: because Yjs resolves concurrent writes per-field (not per-transaction), any scheme relying on coupled field writes staying in sync is inherently unreliable. Instead, we ensure all clients on a document operate at the same schema version, eliminating the need for dual-write entirely.

### 9.2 No Reverse Transforms

Without dual-write, there is no need for reverse transforms. A v2 client never needs to write v1 fields "back" — when operating at v1, it writes v1 fields directly using v1 types. When operating at v2, it writes v2 fields directly using v2 types.

### 9.3 Backend-Driven Version Bumping

The document version bump is driven by backpack, not by client action. Backpack tracks which client versions are connected and bumps when all connected clients support the next version. This keeps the coordination logic in one place (the backend) and prevents race conditions where multiple clients try to bump simultaneously.

### 9.4 Union Variant Migrations

New variants must NOT be added to existing unions. Adding a variant to an existing union creates an inherent incompatibility — old clients cannot parse an unknown discriminant value.

**Pattern:** To add a new variant (e.g., "triangle" to `NodeShape`):
1. Define a new field (e.g., `nodeShapeV2`) that includes all old variants plus the new one.
2. Use `addField` with `derivedFrom: ['nodeShape']` and a forward transform.
3. `removeField('nodeShape')` from the v2 types.
4. The transitional client branches on document version: at v1, uses `nodeShape`; at v2, uses `nodeShapeV2`.

### 9.5 Nested Record and Array/Map Lens

The lens applies recursively to nested data. The migration registry includes field type metadata for all fields, enabling the lens to detect model references and recurse. For arrays/maps containing model-typed elements, the lens iterates each element and applies the appropriate sub-lens.

### 9.6 Type Changes

Type changes on existing fields (e.g., `count: string → count: number`) are modeled as "add new typed field + derive from old." The old field is orphaned.

```javascript
const changeCountType = S.defineSchemaUpdate("changeCountType", (schema) => {
  return { MyRecord: schema.MyRecord
    .addField("countV2", S.Double, {
      derivedFrom: ["count"],
      forward: ({ count }) => parseInt(count),
    })
    .removeField("count")
    .build()
  };
});
```

### 9.7 Undo/Redo Interaction

Because all clients on a document operate at the same version, undo/redo is simpler than in the phased model. Undo reverses writes to the current version's fields only. There is no risk of undo creating inconsistency between old and new field sets, since only one set is being written at any given time.

### 9.8 Output Shaping

The read lens returns full data including all fields. **No runtime key deletion.** Field visibility is governed entirely by the TypeScript per-version types. The raw data may contain more fields than the type exposes, but since the types don't expose them, app code cannot access them without explicit casting.

### 9.9 Registry Completeness

The migration registry includes ALL steps, even from old versions. The lens needs forward transforms forever because old documents may be opened at any time by a client at the latest version.

### 9.10 Transitional Client Ergonomics

The transitional client (supporting two adjacent versions) requires version-branching logic. The codegen mitigates this by producing per-version typed APIs, so the branching is type-safe and localized:

```typescript
const version = useDocumentSchemaVersion();
switch (version) {
  case 1: return <App_v1 />;
  case 2: return <App_v2 />;
}
```

Shared logic that doesn't depend on the record shape (layout, navigation, non-schema UI) doesn't need branching. Only components that read/write migrated fields need version-specific variants.

In practice, the transitional client is short-lived: it exists for one release cycle while old clients are phased out, then is replaced by a clean single-version client.

### 9.11 Additive Changes Don't Need Transitional Clients

For purely additive changes (new field with no dependency on existing fields), the new field is optional in the generated types. A client at the new version can be deployed directly without a transitional release, because:
- Old clients ignore unknown fields (passthrough)
- New clients treat the field as optional (absent in old records, present in new ones)
- If a default is provided, the lens makes it non-optional in the read type

---

## 10. Future Work

- **Migration testing utilities:** A `createMigrationTestHarness` function that lets developers create records at historical schema versions and read them through the current lens.
- **Migration linting:** A codegen pass that warns about potentially lossy migrations or migration chains that may have issues.
- **Peering recommendations:** Standards for long-lived peering environments (additive-only, no online migrations).
- **Selective lens application:** Performance optimization where the lens skips records whose fields already match the current schema.
- **Debug tooling:** A dev-mode inspector that shows the raw Y.Doc data alongside the lens-applied view and which transforms were applied.
- **Nested lens in demo:** Demonstrate recursive lens application on activity events containing record snapshots.
- **Union migration in demo:** Demonstrate the union variant addition pattern.
- **Field removal in demo:** Demonstrate the `removeField` lifecycle.
- **Rollback handling:** Schema reconciliation when a frontend rollback removes fields that were already published to the backend.
- **Automatic version bump policies:** Configurable policies for when backpack should bump document versions (immediate when possible, during low-activity windows, manual trigger only, etc.).
- **Version bump notifications:** UI patterns for notifying users when a document version bump occurs mid-session (e.g., new features becoming available).
- **Offline document handling:** How document version bumps interact with clients that have offline changes queued.

---

## Appendix A: Package Changes Summary

| Package | Changes |
|---------|---------|
| `@palantir/pack.schema` | Extend `RecordBuilder.addField` with `MigrationFieldOptions` and `AdditiveFieldOptions`. Add `removeField`. Add `defineSchemaUpdate`, `nextSchema` builder. |
| `@palantir/pack.document-schema.type-gen` | Generate per-version public types, per-version write types, per-version Zod schemas, internal types (all fields), migration registries with `allFields` type map, `.passthrough()` on Zod schemas. Generate schema manifest for backend. Derive `DocumentModel[Metadata].version` and `minSupportedVersion`. |
| `@palantir/pack.document-schema.model-types` | Add `MigrationRegistry`, `MigrationStepDef`, `FieldMigrationDef`, `FieldDef`, `FieldTypeDescriptor` types to `DocumentSchema` metadata. |
| `@palantir/pack.state.core` | New `migration/` module with `MigrationLens` (`applyReadLens`, `applyLensToValue`). No write lens. Update `YjsSchemaMapper` to accept and apply migrations on read. Update `BaseYjsDocumentService` to extract migrations, expose document schema version, pass migrations through, and include `supportedSchemaVersions` on all wire messages. |
| `@palantir/pack.state.react` | New `useDocumentSchemaVersion()` hook. Existing hooks unchanged (lens is transparent). Per-version types used by application code via generated SDK. |
| `demos/canvas/schema` | Add color split and opacity schema updates |
| `demos/canvas/sdk` | Regenerated with per-version types and migration artifacts |
| `demos/canvas/app` | Updated with version-branching components |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Lens** | A pure read-time transformation that converts raw Y.Doc data into the shape expected by the current schema version. |
| **Forward transform** | A function that computes a new field's value from old field(s). Used by the lens for records that predate the field. |
| **Schema update** | A reusable definition of a schema change (e.g., adding fillColor/strokeColor, removing color). Defined once via `defineSchemaUpdate`, composed into schema versions via `nextSchema`. |
| **Schema version** | A linear integer (1, 2, 3, ...) representing a specific schema shape. Each `nextSchema()` call produces the next version. |
| **Document schema version** | The schema version that a document is currently operating at. All connected clients operate at this version. Backend-driven, one-way ratchet. |
| **Client compatibility range** | The contiguous range `[min, max]` of schema versions a client can operate at. Specified at codegen time. |
| **Transitional client** | A client whose compatibility range spans two or more versions (e.g., `[1, 2]`). Contains version-branching logic. Short-lived by design. |
| **Version bump** | The act of increasing a document's schema version. Driven by backpack when all connected clients support the new version. |
| **Additive migration** | A new field with no dependency on existing fields. May include a `default` value. Does not require a transitional client. |
| **Transform migration** | A migration where a new field's value is derived from existing fields via a forward transform. Requires a transitional client to bridge versions. |
| **Field removal** | Removing a field from the public types. The field remains in the Y.Doc (orphaned). The lens retains knowledge of removed fields for forward transforms. |
| **Orphaned field** | A field that exists in the Y.Doc but is no longer in any current-version type. Left as-is; never deleted from the CRDT. |
| **Per-field presence** | The lens mechanism: check if a field exists in the Y.Doc; if not, check if it can be derived from source fields via forward transform. No version numbers stored per-field. |
| **Field type descriptor** | Metadata describing a field's type (`primitive`, `modelRef`, `array`, `map`, `optional`). Enables recursive lens application to nested data. |
| **Schema manifest** | A codegen artifact describing the full version history — per-version field lists and the compatibility matrix. Consumed by backpack. |
