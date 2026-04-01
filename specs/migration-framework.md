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
- longer schema version soak times to match expected stack skew
- structuring the app to promoted additive only changes
- avoiding schema changes where at all possible
- adopting flexible schemas that allow for features to be added without schema changes

### 1.2 Migration Stages

Each SDK version declares a **stage** for its migration group. All migrations declared within a single SDK version share the same stage. The four stages are:

| Stage | Name | Read Source | Write Target | Public Type Includes |
|-------|------|-------------|--------------|---------------------|
| 1 | `baseline` | Old fields | Old fields | Old fields only |
| 2 | `soak` | Old fields | Both old and new | Old fields only (new fields hidden) |
| 3 | `adopt` | New fields | Both old and new | New fields only (old fields hidden) |
| 4 | `finalize` | New fields | New fields only* | New fields only |

*\*Finalization behavior for old fields is configurable per migration: `orphan` (leave as-is), `delete` (remove from Y.Doc on write), or `sync` (keep old field updated via reverse transform).*

For purely additive changes (new independent field, no dependency on existing fields), stages 2-4 collapse: the field is simply optional starting from the version that adds it.

### 1.3 Field Presence Model

The read lens does not detect or track a "record version number." Instead, it operates on a **per-field presence** basis: for each field the current SDK expects, the lens asks:

1. **Is the field present in the Y.Doc?** If yes, use it directly.
2. **Is the field absent but derivable?** If a forward transform exists that can compute the field from other present fields, derive it.
3. **Is the field absent and not derivable?** Return `undefined` (the field is optional by construction — all migration-added fields are optional).

This approach is simpler and more robust than version numbering because:
- It is agnostic to *why* a field is present or absent. A `fillColor` field might exist because a soak-stage client dual-wrote, a finalize-stage client wrote it, or the record was freshly created at the latest schema. The lens doesn't care.
- It handles `onFinalize` modes (`orphan`, `delete`, `sync`) uniformly. Whether `color` is still present alongside `fillColor` or has been deleted, the lens produces the same output.
- It avoids introducing a CRDT metadata field (e.g., `__v`) that could conflict under concurrent writes from clients at different versions.

### 1.4 Lens Model

The lens is a **pure read-time transformation**. When reading a record from the Y.Doc:

1. The raw Y.Map data is extracted (all fields, including unknown ones — passthrough).
2. For each migration step, the lens checks whether derived fields are absent and their source fields are present. If so, the forward transform is applied to compute the missing field.
3. For additive fields with a `default` value, if the field is absent, the default is returned.
4. For fields of record/union types, the lens recursively applies the appropriate sub-lens to nested data.
5. The full data is returned. Field visibility is governed by the TypeScript types (stage-dependent), not by runtime key deletion — the data may contain more fields than the type exposes.

The lens **never writes back** to the Y.Doc as a side effect of reading. Writes only occur when the application explicitly calls `updateRecord` or `setRecord`.

This is important for CRDT consistency. If the lens wrote derived fields back to the Y.Doc on read, it would generate Yjs mutations that propagate to all connected clients. A v1 client would see `fillColor` appear unexpectedly (written by a v2 client's read lens), despite no user action. Worse, if multiple v2 clients read the same v1 record concurrently, they would all trigger write-backs, creating unnecessary CRDT conflicts on the derived fields.

### 1.5 Write Behavior

During the `soak` and `adopt` stages, writes to migration-linked fields must include **both** old and new field values. The SDK enforces this at the TypeScript type level: if a developer's partial update includes any field involved in an active migration, all linked fields become required in the update type.

During `finalize`, only new fields are written. The behavior for old fields depends on the migration's `onFinalize` setting.

The SDK does **not** automatically invoke reverse transforms. If a forward transform exists (`color → { fillColor: color, strokeColor: color }`), the reverse is often lossy (which color do you pick from fill vs stroke?). Instead, the developer explicitly provides all linked field values when writing.

### 1.6 Schema Versioning

Each call to `nextSchema()` produces a new schema version with a **linear integer version number** (1, 2, 3, ...). This is not semver — it is a strictly incrementing counter representing the schema chain length.

```
schemaV0 (baseline)  → version 1
schemaV1 (soak)      → version 2
schemaV2 (adopt)     → version 3
schemaV3 (finalize)  → version 4
```

The version number is embedded in `DocumentModel[Metadata].version` by the codegen, derived from the schema chain. It is **not** stored per-field — the codegen can compute when each field was added, when it started soaking, etc. by walking the schema chain. The version number serves as a **wire identifier** that the backend uses for compatibility enforcement (see 1.8).

### 1.7 Compatibility Constraints

Compatibility constraints are **automatically derived** from the stage graph rather than manually declared. The rule is:

- A schema version that **finalizes** a transform migration is incompatible with any peer still at **baseline** (pre-soak) for that migration, because finalized clients stop writing old fields that baseline clients depend on.
- A schema version at **adopt** is compatible with all peers at **soak** or later, since soak clients dual-write and adopt clients still dual-write.
- **Soak** and **baseline** are always mutually compatible (soak dual-writes, baseline reads old fields).
- **Additive-only** changes impose no compatibility constraints.

The codegen derives a **compatibility matrix** from the schema chain and publishes it as schema metadata. Enforcement is the backend's responsibility (see 1.8).

### 1.8 Frontend/Backend Contract

The frontend and backend have a clear division of responsibilities:

**Frontend (this spec) is responsible for:**
- Defining the schema, migrations, stages, and forward transforms
- Generating types, write types, migration registries, and the read/write lens
- Including the client's schema version on all wire messages (loads, subscriptions, document updates)
- Applying the lens to read old data correctly and shaping write types to enforce dual-write

**Backend (backpack) is responsible for:**
- Persisting the document type schema and its version history
- Tracking the current schema version of each document (bumped lazily on first write to a new field)
- Computing and persisting read/write version ranges from the schema's compatibility matrix
- Enforcing that a client's schema version is within the compatible range before allowing loads, subscriptions, and updates
- Rejecting updates from clients whose schema version is outside the write-compatible range
- Ensuring that record updates from older clients do not nullify fields they don't know about

**Wire protocol changes:** The document service includes `clientSchemaVersion` (read from `DocumentModel[Metadata].version`) on:
- Document load requests
- Document subscription requests
- Document update messages (`DocumentUpdate`)

The backend uses this to check compatibility and reject incompatible operations. The frontend does not enforce version compatibility — it relies on the backend to block incompatible clients.

**Per-field backwards compatibility modes** (e.g., COMPATIBLE / READONLY / INCOMPATIBLE as proposed by the backend team) are **deferred** for now. The stage model (soak/adopt/finalize) provides the compatibility semantics. If the stage model proves insufficient for expressing nuanced compatibility requirements, per-field modes can be added to the DSL as metadata that flows through to the backend.

---

## 2. Schema DSL

### 2.1 Extending `addField` on RecordBuilder

The existing `RecordBuilder.addField(name, type)` method is extended with an optional migration options parameter:

```typescript
interface MigrationFieldOptions<TNew, TOld extends Record<string, unknown>> {
  /** Fields this new field is derived from. Presence of these fields determines record version. */
  derivedFrom: (keyof TOld)[];

  /**
   * Forward transform: computes the new field value from the old field(s).
   * Required (inline) — used by the read lens for old documents.
   * For complex cases requiring runtime info, the function receives a context parameter.
   */
  forward: (oldFields: Pick<TOld, keyof TOld>) => TNew;

  /**
   * Reverse transform: computes the old field value(s) from the new field.
   * Optional — only needed if the migration's onFinalize is 'sync'.
   * Can be 'runtime' to indicate it will be provided at document service init.
   */
  reverse?: ((newValue: TNew) => Partial<TOld>) | 'runtime';

  /**
   * Behavior when the migration is finalized:
   * - 'orphan': leave old fields as-is in the Y.Doc (default)
   * - 'delete': remove old fields from Y.Doc on next write
   * - 'sync': keep old fields updated via reverse transform on every write
   */
  onFinalize?: 'orphan' | 'delete' | 'sync';
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
   * Mark a field for removal. The field follows the same soak/adopt/finalize
   * stage progression as addField, with removal-specific semantics:
   * - soak: field becomes Optional<T> in read type (deprecation period, still writable)
   * - adopt: field hidden from read type (no longer visible to app code)
   * - finalize: field hidden from read and write types (orphaned in Y.Doc forever)
   */
  removeField<K extends keyof T>(name: K): RecordBuilder<Omit<T, K>>;

  build(): RecordDef<T>;
}
```

### 2.2 Schema Updates (Stage-Agnostic Change Definitions)

Schema changes are defined as standalone, reusable objects that describe *what* changes, without specifying a stage. The stage is declared when composing updates into a schema version.

```typescript
/**
 * A standalone schema change definition. Stage-agnostic — the same
 * change object is referenced at different stages across schema versions.
 */
function defineSchemaUpdate<T extends ReturnedSchema, S extends ReturnedSchema>(
  name: string,
  migration: (schema: SchemaBuilder<T>) => S,
): SchemaUpdate<T, S>;
```

### 2.3 Schema Version Builder

Each schema version is constructed by composing schema updates at declared stages. The builder validates stage ordering: transform migrations must follow the `soak → adopt → finalize` progression across versions, while purely additive changes can skip directly to `finalize`.

```typescript
interface SchemaVersionBuilder<T extends ReturnedSchema> {
  /**
   * Add a schema update at a specific stage.
   * The builder validates stage progression:
   * - Transform migrations: soak → adopt → finalize (must follow order)
   * - Additive-only changes: can be added directly at 'finalize'
   */
  addSchemaUpdate<S extends ReturnedSchema>(
    update: SchemaUpdate<T, S>,
    stage: 'soak' | 'adopt' | 'finalize',
  ): SchemaVersionBuilder<T & S>;

  build(): Schema<T>;
}

function nextSchema<T extends ReturnedSchema>(
  previous: Schema<T>,
): SchemaVersionBuilder<T>;
```

### 2.4 Canvas Demo Example

```javascript
// schema.mjs

// --- Baseline schema (v0) ---
const schemaV0 = S.defineMigration({}, () => {
  const ShapeBox = S.defineRecord("ShapeBox", {
    fields: { left: S.Double, right: S.Double, top: S.Double, bottom: S.Double, color: S.Optional(S.String) },
  });
  // ... ShapeCircle, NodeShape, ActivityEvent, PresenceEvent ...
  return { ShapeBox, ShapeCircle, NodeShape, /* ... */ };
});

// --- Schema change definitions (stage-agnostic, defined once) ---

const addColorSplit = S.defineSchemaUpdate("addColorSplit", (schema) => {
  const ShapeBox = schema.ShapeBox
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
      onFinalize: "delete",
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
      onFinalize: "delete",
    })
    .build();

  const ShapeCircle = schema.ShapeCircle
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
      onFinalize: "delete",
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
      onFinalize: "delete",
    })
    .build();

  return { ShapeBox, ShapeCircle };
});

const addOpacity = S.defineSchemaUpdate("addOpacity", (schema) => {
  const ShapeBox = schema.ShapeBox
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build();

  const ShapeCircle = schema.ShapeCircle
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build();

  return { ShapeBox, ShapeCircle };
});

// --- Schema versions (compose updates at specific stages) ---

// v1: introduce color split (soaking) and opacity (additive, straight to finalize)
const schemaV1 = S.nextSchema(schemaV0)
  .addSchemaUpdate(addColorSplit, "soak")
  .addSchemaUpdate(addOpacity, "finalize")
  .build();

export default schemaV1;
```

### 2.5 Stage Advancement

To advance the color split migration, the developer creates a **new** schema version. The change definition is never modified — only the stage advances:

```javascript
// Later release: color split advances to 'adopt'
const schemaV2 = S.nextSchema(schemaV1)
  .addSchemaUpdate(addColorSplit, "adopt")
  .build();

export default schemaV2;
```

```javascript
// Even later: color split advances to 'finalize'
const schemaV3 = S.nextSchema(schemaV2)
  .addSchemaUpdate(addColorSplit, "finalize")
  .build();

export default schemaV3;
```

**Implicit carry-forward:** Schema updates not mentioned in a new version implicitly carry forward at their current stage. In the example above, `schemaV2` only mentions `addColorSplit` — `addOpacity` carries forward at `finalize` from `schemaV1` automatically.

**Validation rules:**
- Stages must advance forward (`soak → adopt → finalize`). Going backwards is an error.
- Repeating the same stage (e.g., `soak` again when already at `soak`) is an error — the update should either advance or be omitted (implicit carry-forward).
- Additive-only changes can skip directly to `finalize` and don't need to appear in subsequent versions.

---

## 3. Code Generation Output

### 3.1 Dual Type Layers

The codegen produces two layers of types:

#### Internal types (not exported to application code)

Contains **all** fields across all versions, used by the lens and mapper:

```typescript
// _internal/types.ts (not re-exported from index.ts)

/** Internal representation containing all fields across all schema versions. */
export interface ShapeBox__Internal {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;       // v1 field
  readonly fillColor?: string;   // v2 field (migration from color)
  readonly strokeColor?: string; // v2 field (migration from color)
  readonly opacity?: number;     // v2 field (additive)
}
```

#### Public types (exported, stage-dependent)

In `soak` stage (read old, write both — new fields hidden from read):

```typescript
// types.ts

export interface ShapeBox {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly color?: string;
  readonly opacity: number; // required — lens guarantees default of 1.0
}
```

In `adopt` stage (read new, write both — old fields hidden from read):

```typescript
export interface ShapeBox {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly opacity: number;
}
```

In `finalize` stage (read new, write new):

```typescript
export interface ShapeBox {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly opacity: number;
}
```

### 3.2 Write Types (Conditional Paired Fields)

During `soak` and `adopt` stages, the codegen produces constrained write types that enforce migration field pairing:

```typescript
// writeTypes.ts

/**
 * Update type for ShapeBox during 'soak' stage.
 * If you update 'color', you must also provide 'fillColor' and 'strokeColor'.
 */
export type ShapeBoxUpdate =
  | ShapeBoxUpdateWithoutMigration
  | ShapeBoxUpdateWithColorMigration;

interface ShapeBoxUpdateWithoutMigration {
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly opacity?: number;
  // color, fillColor, strokeColor NOT present
}

interface ShapeBoxUpdateWithColorMigration {
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly opacity?: number;
  readonly color: string;        // required when migration group is present
  readonly fillColor: string;    // required
  readonly strokeColor: string;  // required
}
```

The `updateRecord` call is typed to accept `ShapeBoxUpdate` instead of `Partial<ShapeBox>` when migrations are active.

During `finalize` stage with `onFinalize: 'delete'`:

```typescript
export type ShapeBoxUpdate = {
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly opacity?: number;
  // color is not in the type at all
};
```

### 3.3 Zod Schemas

Generated Zod schemas use `.passthrough()` to preserve unknown fields through read/write cycles:

```typescript
// schema.ts

export const ShapeBoxSchema = z.object({
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  color: z.string().optional(),
  opacity: z.number().optional(),
}).passthrough() satisfies ZodType<ShapeBox>;
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

### 3.4 Migration Metadata

The codegen emits a migration registry that the lens consumes at runtime:

```typescript
// _internal/migrations.ts

import type { MigrationStep, MigrationRegistry } from "@palantir/pack.state.core";

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
      stage: "soak", // current stage for this update in this schema version
      fields: {
        fillColor: {
          derivedFrom: ["color"],
          forward: ({ color }) => color,
          onFinalize: "delete",
        },
        strokeColor: {
          derivedFrom: ["color"],
          forward: ({ color }) => color,
          onFinalize: "delete",
        },
      },
    },
    {
      name: "addOpacity",
      stage: "finalize", // additive, straight to finalize
      fields: {
        opacity: {
          derivedFrom: [],
          forward: () => undefined,
          onFinalize: "orphan",
          default: 1.0,
        },
      },
    },
  ],
};
```

### 3.5 Model Metadata Updates

The `DocumentModel` metadata is extended to include migration information. The `version` field is a **linear integer** derived from the schema chain length (see section 1.6). The document service reads this to include on all wire messages.

```typescript
// models.ts

export const DocumentModel = {
  ShapeBox: ShapeBoxModel,
  // ...
  [Metadata]: {
    version: 2, // linear integer, derived from schema chain (schemaV0=1, schemaV1=2, ...)
    migrations: {
      ShapeBox: ShapeBoxMigrations,
      ShapeCircle: ShapeCircleMigrations,
    },
  },
} as const satisfies DocumentSchema;
```

The codegen also produces a **schema manifest** that the backend can consume to understand the full version history. This manifest is derived from the schema chain at generation time and includes, per version: which fields were added, their stages, default values, and the auto-derived compatibility matrix. Field-level `addedInVersion` is not stored as an annotation — it is computed by walking the schema chain.

### 3.6 Runtime Transform Interface

For migrations that declared `reverse: 'runtime'`, the codegen emits a typed interface:

```typescript
// _internal/migrationTransforms.ts

/**
 * Runtime transforms that must be provided at document service initialization.
 * All required transforms must be registered before documents can be loaded.
 */
export interface RequiredMigrationTransforms {
  // Empty for the canvas demo (no runtime transforms needed).
  // If a migration declared reverse: 'runtime', it would appear here:
  // ShapeBox_hexColor_reverse: (hexColor: string) => { color: string };
}
```

---

## 4. Runtime Lens System

### 4.1 Core Lens Interface

A new package or module within `@palantir/pack.state.core`:

```typescript
// packages/state/core/src/migration/MigrationLens.ts

/** Type descriptor for a field, enabling recursive lens application. */
type FieldTypeDescriptor =
  | { kind: 'primitive' }           // string, number, boolean — no recursion
  | { kind: 'modelRef'; model: string }  // reference to another record/union
  | { kind: 'array'; element: FieldTypeDescriptor }
  | { kind: 'map'; value: FieldTypeDescriptor }
  | { kind: 'optional'; inner: FieldTypeDescriptor };

interface FieldMigrationDef {
  derivedFrom: string[];
  forward: (oldFields: Record<string, unknown>) => unknown;
  onFinalize: 'orphan' | 'delete' | 'sync';
  reverse?: (newValue: unknown) => Record<string, unknown>;
  /** Default value for additive fields (no derivation). */
  default?: unknown;
}

/** Type info for ALL fields in a record (not just migrated ones). */
interface FieldDef {
  type: FieldTypeDescriptor;
  /** Present only for fields involved in a migration. */
  migration?: FieldMigrationDef;
  /** Default value (for additive fields). */
  default?: unknown;
  /** Whether this field is being removed via removeField. */
  removing?: boolean;
}

interface MigrationStepDef {
  /** Human-readable name of the schema update this step corresponds to. */
  name: string;
  /** The current stage of this schema update in this schema version. */
  stage: 'soak' | 'adopt' | 'finalize';
  /** Fields added or modified by this step. */
  fields: Record<string, FieldMigrationDef>;
  /** Fields being removed by this step. */
  removedFields?: string[];
}

interface MigrationRegistry<ModelName extends string = string> {
  modelName: ModelName;
  /** Type info for all fields (enables recursive lens for nested model refs). */
  allFields: Record<string, FieldDef>;
  /** Migration steps, ordered. Includes finalized steps (lens needs forward transforms forever). */
  steps: MigrationStepDef[];
}
```

### 4.2 Read Lens

The read lens uses per-field presence checking rather than version detection. For each migration step, it checks whether derived fields are missing and computes them from source fields if possible:

```typescript
function applyReadLens(
  rawData: Record<string, unknown>,
  registry: MigrationRegistry,
  allRegistries: MigrationRegistryMap, // needed for recursive lens application
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
      return value; // no transformation
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

### 4.3 Write Lens

```typescript
function applyWriteLens(
  updateData: Record<string, unknown>,
  registry: MigrationRegistry,
): Record<string, unknown> {
  let output = { ...updateData };

  for (const step of registry.steps) {
    if (step.stage === 'finalize') {
      // Handle onFinalize behaviors for this step's fields
      for (const [fieldName, def] of Object.entries(step.fields)) {
        if (def.derivedFrom.length === 0) continue;
        for (const src of def.derivedFrom) {
          if (def.onFinalize === 'delete') {
            // Mark old field for deletion (YjsSchemaMapper interprets undefined as delete)
            output[src] = undefined;
          }
          // 'orphan': do nothing — old field left as-is
          // 'sync': apply reverse transform (if registered) to keep old field updated
        }
      }
    }

    // In soak/adopt stages, the TypeScript types already enforce
    // that migration-linked fields come in complete groups.
    // The write lens just passes them through.
  }

  return output;
}
```

### 4.4 Lens Chain Walking

When multiple migration steps exist (e.g., step 1: `color → hexColor`, step 2: `hexColor → rgbaColor`), the read lens walks the steps in order. Because each step checks field presence and derives missing fields, chaining works naturally:

```typescript
// Record has only 'color'. Steps: [addHexColor, addRgbaColor]
//
// Step 1 (addHexColor): 'hexColor' missing, 'color' present → derive hexColor
// Step 2 (addRgbaColor): 'rgbaColor' missing, 'hexColor' now present (just derived) → derive rgbaColor
//
// The per-field presence model handles chains without explicit version tracking.
// Each step sees the accumulated data from all previous steps.
```

This is done at runtime, not pre-composed. This is simpler and more debuggable.

---

## 5. YjsSchemaMapper Changes

### 5.1 Migration-Aware Mapper

`YjsSchemaMapper` becomes the interception point for the lens. The key changes:

```typescript
// YjsSchemaMapper.ts

import { applyReadLens, applyWriteLens } from "../migration/MigrationLens.js";
import type { MigrationRegistry } from "../migration/types.js";

/**
 * New parameter: migrations registry, keyed by model (storage) name.
 * Passed in from the DocumentSchema metadata.
 */
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
    return applyReadLens(rawState as Record<string, unknown>, registry);
  }

  return rawState;
}

export function updateRecord(
  yDoc: Y.Doc,
  storageName: string,
  recordId: RecordId,
  partialState: Partial<ModelData<Model>>,
  migrations?: MigrationRegistryMap,
): boolean {
  const registry = migrations?.[storageName];
  let effectiveState = partialState;

  if (registry && registry.steps.length > 0) {
    effectiveState = applyWriteLens(
      partialState as Record<string, unknown>,
      registry,
    ) as Partial<ModelData<Model>>;
  }

  // ... existing update logic with effectiveState ...
}

export function setRecord(
  yDoc: Y.Doc,
  storageName: string,
  recordId: RecordId,
  state: ModelData<Model>,
  migrations?: MigrationRegistryMap,
): boolean {
  const registry = migrations?.[storageName];
  let effectiveState = state;

  if (registry && registry.steps.length > 0) {
    effectiveState = applyWriteLens(
      state as Record<string, unknown>,
      registry,
    ) as ModelData<Model>;
  }

  // ... existing set logic with effectiveState ...
}
```

### 5.2 Passthrough on yMapToState

The existing `yMapToState` function already returns all fields from the Y.Map. No changes needed here — passthrough behavior is inherent since it reads all keys.

### 5.3 populateYMapFromState Changes

The `populateYMapFromState` function currently skips `undefined` values. For `onFinalize: 'delete'`, we need to explicitly delete keys:

```typescript
// In updateYMapFromPartialState, the existing logic already handles this:
// if (value === undefined) { yMap.delete(key); return; }
// No change needed — the write lens sets fields to undefined for deletion.
```

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

  // Extract migration registries from schema metadata
  const schemaMeta = getMetadata(schema);
  const migrations = schemaMeta?.migrations;

  return {
    // ... existing fields ...
    migrations,
  } as TDoc;
}
```

### 6.2 Startup Validation

If migrations declare `reverse: 'runtime'`, the document service blocks loading until all required transforms are registered:

```typescript
// BaseYjsDocumentService.ts

private runtimeTransforms: Map<string, Function> = new Map();

registerRuntimeTransform(key: string, fn: Function): void {
  this.runtimeTransforms.set(key, fn);
}

private validateMigrationTransforms(migrations: MigrationRegistryMap): void {
  for (const [modelName, registry] of Object.entries(migrations)) {
    for (const step of registry.steps) {
      for (const [fieldName, def] of Object.entries(step.fields)) {
        if (def.reverse === 'runtime') {
          const key = `${modelName}_${fieldName}_reverse`;
          if (!this.runtimeTransforms.has(key)) {
            throw new Error(
              `Missing runtime migration transform: ${key}. ` +
              `Register it via documentService.registerRuntimeTransform() before loading documents.`
            );
          }
        }
      }
    }
  }
}
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
    internalDoc.migrations, // NEW
  );
  return snapshot as ModelData<M>;
};

readonly updateRecord = <R extends Model>(
  recordRef: RecordRef<R>,
  partialState: Partial<ModelData<R>>,
): Promise<void> => {
  // ... existing validation ...
  YjsSchemaMapper.updateRecord(
    internalDoc.yDoc,
    storageName,
    recordId,
    partialState,
    internalDoc.migrations, // NEW
  );
};
```

### 6.4 Client Schema Version on Wire

The document service reads the schema version from `DocumentModel[Metadata].version` and includes it on all outgoing wire messages. This is the backend contract described in section 1.8.

```typescript
// BaseYjsDocumentService.ts

protected getClientSchemaVersion(schema: DocumentSchema): number {
  return getMetadata(schema).version;
}
```

The schema version is included on:
- **Document load requests** — so the backend can reject loads from incompatible clients.
- **Document subscription requests** — so the backend can reject subscriptions and prevent incompatible clients from receiving updates.
- **Document update messages** — so the backend can reject writes from clients whose version is outside the write-compatible range, and can lazily bump the document's version when a client first writes using a field from a newer schema.

The exact wire format depends on the backend's `DocumentUpdate` type definition (owned by the backend team). The frontend provides the version; the backend decides how to use it.

---

## 7. React Hook Implications

### 7.1 useRecord / useRecords

These hooks call `getRecordSnapshot` internally, which now applies the read lens. **No changes needed in the hooks themselves** — the lens is transparent.

However, because Yjs fires change events for *all* field mutations (including fields the current version doesn't expose), components may re-render with identical lens-applied data. This is acceptable: React's reconciliation handles no-op re-renders efficiently. If performance becomes an issue, a shallow-equality check can be added later at the hook level.

### 7.2 useOnDocActivityEvents

Activity events reference record types (e.g., `ActivityShapeUpdateEvent` contains `oldShape` and `newShape` of type `NodeShape`). These events go through the lens layer:

- When constructing activity event data that includes record snapshots, the snapshots are lens-applied.
- When receiving activity events from other clients (via Yjs), embedded record data is lens-applied on read.

This is automatic because activity event construction uses `getRecordSnapshot`, which already applies the lens.

### 7.3 Type Changes for Hooks

The `useRecord` hook's return type changes based on the generated public type, which is stage-dependent. During `soak`, the hook returns `ShapeBox` with `color` visible. During `adopt`, it returns `ShapeBox` with `fillColor`/`strokeColor` visible.

The `updateRecord` function exposed by hooks uses the generated write type (`ShapeBoxUpdate`), which enforces migration field pairing at compile time.

---

## 8. Canvas Demo Migration

### 8.1 migration001: Fill/Stroke Split + Opacity

**Schema changes:**

| Record | Field | Change Type | Forward Transform |
|--------|-------|-------------|-------------------|
| ShapeBox | `fillColor` | Split from `color` | `({ color }) => color` |
| ShapeBox | `strokeColor` | Split from `color` | `({ color }) => color` |
| ShapeBox | `opacity` | Additive (default: 1.0) | N/A |
| ShapeCircle | `fillColor` | Split from `color` | `({ color }) => color` |
| ShapeCircle | `strokeColor` | Split from `color` | `({ color }) => color` |
| ShapeCircle | `opacity` | Additive (default: 1.0) | N/A |

**Finalization:** `onFinalize: 'delete'` for `fillColor` and `strokeColor` (old `color` field is deleted when finalized).

### 8.2 Demo at Each Stage

**Stage: `soak` (initial release)**
- App code reads `color` and `opacity` from shapes.
- When user changes a shape's color, app writes `{ color: 'blue', fillColor: 'blue', strokeColor: 'blue' }`.
- The `fillColor`/`strokeColor` fields are hidden from the public type — the dual-write values are provided through the migration-aware write type.
- Old clients (v1) see `color` changes normally. They ignore `fillColor`/`strokeColor`.

**Stage: `adopt` (later release)**
- App code reads `fillColor`, `strokeColor`, and `opacity`.
- Lens derives `fillColor`/`strokeColor` from `color` for old records that lack them.
- When user changes fill color, app writes `{ fillColor: 'red', strokeColor: existingStroke, color: 'red' }`.
- Old clients (v1) see `color` changes. Soak clients (v2) see `fillColor`/`strokeColor` in dual-write.

**Stage: `finalize` (final release)**
- App code reads only `fillColor`, `strokeColor`, `opacity`.
- Lens still derives from `color` for old documents.
- Writes only set `fillColor`/`strokeColor`. `color` is deleted from the Y.Map on write.

### 8.3 Demo File Changes

| File | Change |
|------|--------|
| `demos/canvas/schema/src/schema.mjs` | Add `migration001` with fill/stroke split and opacity |
| `demos/canvas/sdk/src/types.ts` | Regenerated: stage-dependent public types |
| `demos/canvas/sdk/src/_internal/types.ts` | New: internal types with all fields |
| `demos/canvas/sdk/src/_internal/migrations.ts` | New: migration registry |
| `demos/canvas/sdk/src/_internal/schema.ts` | New: internal Zod schema with all fields |
| `demos/canvas/sdk/src/writeTypes.ts` | New: constrained write types |
| `demos/canvas/sdk/src/schema.ts` | Updated: `.passthrough()` on Zod schemas |
| `demos/canvas/sdk/src/models.ts` | Updated: migration metadata in `DocumentModel` |
| `demos/canvas/app/` | Updated: components use new color fields (stage-dependent) |

---

## 9. Resolved Design Decisions

This section documents design decisions that were considered during the spec process.

### 9.1 Union Variant Migrations

**Decision:** New variants must NOT be added to existing unions. Adding a variant to an existing union creates an inherent incompatibility — old clients cannot parse an unknown discriminant value (Zod `z.discriminatedUnion` rejects unknown discriminants, and `.passthrough()` does not help).

**Pattern:** To add a new variant (e.g., "triangle" to `NodeShape`):
1. Define a new union field (e.g., `nodeShapeV2`) that includes all old variants plus the new one.
2. Use the standard `addField` migration with `derivedFrom: ['nodeShape']` and a forward transform (identity map for known variants).
3. Progress through `soak → adopt → finalize` as with any field migration.

During dual-write, the developer must provide a value for the old union when writing a new variant to the new union. This mapping is **lossy by design** (e.g., triangle maps to circle in the old union). The SDK makes this explicit by requiring both values in the write type. If the loss is unacceptable, the developer should defer writing new-variant values until the migration is finalized.

### 9.2 Multi-Field Migration Groups

**Decision:** All derived fields within a single `defineSchemaUpdate` form one **migration group**. The generated write type requires all-or-nothing for the entire group: updating any field in the group requires providing all new fields AND all old fields in the group.

This is intentionally coarse but simple. Finer-grained sub-grouping (via transitive closure of shared source fields) was considered but rejected due to codegen complexity and difficulty reasoning about the resulting types.

Example: for `{ left, right, top, bottom } → { x, y, width, height }`, all eight fields form one group. Updating `x` requires providing `y`, `width`, `height`, `left`, `right`, `top`, and `bottom`.

### 9.3 Nested Record and Array/Map Lens

**Decision:** The lens applies recursively to nested data. The migration registry includes **field type metadata for all fields** (not just migrated ones), enabling the lens to detect model references and recurse.

For arrays/maps containing model-typed elements, the lens iterates each element and applies the appropriate sub-lens. The `FieldTypeDescriptor` system (`modelRef`, `array`, `map`, `optional`) provides the structure.

This means activity events containing record snapshots (e.g., `ActivityShapeUpdateEvent.oldShape: NodeShape`) are automatically lens-applied when read.

### 9.4 Field Deletion

**Decision:** Supported via `removeField` on `RecordBuilder`. The same `soak → adopt → finalize` stages apply with removal-specific semantics:

| Stage | Read Type | Write Type | Behavior |
|-------|-----------|------------|----------|
| `soak` | `Optional<T>` (was `T`) | `Optional<T>` | Deprecation period. App should prepare for field being absent. Still writable for backward compat. |
| `adopt` | Hidden | Hidden | Field invisible to app code. Remains in Y.Doc. |
| `finalize` | Hidden | Hidden | Permanently orphaned in Y.Doc. |

The field is **never deleted from the Y.Doc** because no write triggers its removal (unlike transform migrations with `onFinalize: 'delete'`, where a write to the new field can simultaneously delete the old one).

### 9.5 Type Changes

**Decision:** Type changes on existing fields (e.g., `count: string → count: number`) are modeled as "add new typed field + derive from old + finalize with delete." This is a natural consequence of the existing design and requires no DSL changes.

**Pattern:**
```javascript
const changeCountType = S.defineSchemaUpdate("changeCountType", (schema) => {
  return { MyRecord: schema.MyRecord
    .addField("countV2", S.Double, {
      derivedFrom: ["count"],
      forward: ({ count }) => parseInt(count),
      onFinalize: "delete",
    })
    .build()
  };
});
```

### 9.6 Undo/Redo Interaction

**Known limitation:** During dual-write stages, Yjs undo/redo reverses entire transactions. If a soak-stage client writes `{ color: 'blue', fillColor: 'blue', strokeColor: 'blue' }` and a concurrent v1 client only wrote `color`, undo may cause brief inconsistency between old and new fields (e.g., `color` reverts but `fillColor` retains a value from a different write). This is inherent in per-field CRDT semantics and resolves on the next explicit write.

### 9.7 Output Shaping

**Decision:** The read lens returns full data including all fields (old, new, hidden). **No runtime key deletion.** Field visibility is governed entirely by the TypeScript types, which are generated stage-appropriately. The raw data may contain more fields than the public type exposes, but since TypeScript types don't expose them, app code cannot access them without explicit casting.

### 9.8 Implicit Carry-Forward

**Decision:** Schema updates not mentioned in a new version implicitly carry forward at their current stage. The `nextSchema` builder inherits all updates from the previous version. Only updates that are advancing need to be declared. Going backwards is an error.

### 9.9 Registry Completeness

**Decision:** The migration registry includes ALL schema updates, even finalized ones. The lens needs forward transforms forever because old documents (from months or years ago) may be opened at any time by a client at the latest version.

---

## 10. Future Work

- **Per-field backwards compatibility modes:** If the stage model (soak/adopt/finalize) proves insufficient for expressing nuanced compatibility requirements, add per-field modes (COMPATIBLE / READONLY / INCOMPATIBLE) to the DSL as metadata that flows through to the backend. This was proposed by the backend team and deferred pending experience with the stage model.
- **Migration testing utilities:** A `createMigrationTestHarness` function that lets developers create records at historical schema versions and read them through the current lens, verifying forward transforms produce expected output.
- **Migration linting:** A codegen pass that warns about potentially lossy migrations, missing reverse transforms for `sync` finalization, or migration chains that may have issues.
- **Peering recommendations:** Standards for long-lived peering environments (additive-only, no online migrations). This is noted as out of scope — peering apps should follow separate guidelines.
- **Selective lens application:** Performance optimization where the lens skips records whose fields already match the current schema (all expected fields present, no derivation needed).
- **Debug tooling:** A dev-mode inspector that shows the raw Y.Doc data alongside the lens-applied view and which transforms were applied.
- **Nested lens in demo:** Demonstrate recursive lens application on activity events containing record snapshots (e.g., `ActivityShapeUpdateEvent.oldShape`).
- **Union migration in demo:** Demonstrate the union variant addition pattern (new union field, soak, adopt, finalize).
- **Field removal in demo:** Demonstrate the `removeField` deprecation lifecycle.
- **Rollback handling:** Schema reconciliation when a frontend rollback removes fields that were already published to the backend. The backend team has proposed using the frontend schema as source of truth with explicit confirmation of auto-deprecation.

---

## Appendix A: Package Changes Summary

| Package | Changes |
|---------|---------|
| `@palantir/pack.schema` | Extend `RecordBuilder.addField` signature with `MigrationFieldOptions` and `AdditiveFieldOptions`. Add `removeField`. Add `defineSchemaUpdate`, `nextSchema` builder with `addSchemaUpdate(update, stage)` and implicit carry-forward. |
| `@palantir/pack.document-schema.type-gen` | Generate internal types, write types (with migration group pairing), migration registries (with `allFields` type map), `.passthrough()` on Zod, dual type layers. Generate `opacity: number` (non-optional) for fields with defaults. Generate schema manifest (version history, per-version field additions/stages, compatibility matrix) for backend consumption. Derive `DocumentModel[Metadata].version` as linear integer from schema chain. |
| `@palantir/pack.document-schema.model-types` | Add `MigrationRegistry`, `MigrationStepDef`, `FieldMigrationDef`, `FieldDef`, `FieldTypeDescriptor` types to `DocumentSchema` metadata. |
| `@palantir/pack.state.core` | New `migration/` module with `MigrationLens` (`applyReadLens`, `applyWriteLens`, `applyLensToValue` for recursive application). Update `YjsSchemaMapper` to accept and apply migrations. Update `BaseYjsDocumentService` to extract migrations, pass them through, and include `clientSchemaVersion` on all wire messages (loads, subscriptions, updates). |
| `@palantir/pack.state.react` | No direct changes (lens is transparent). Write types used by hooks change via generated SDK. |
| `demos/canvas/schema` | Add `migration001` |
| `demos/canvas/sdk` | Regenerated with migration artifacts |
| `demos/canvas/app` | Updated to use stage-appropriate types |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Lens** | A pure read-time transformation that converts raw Y.Doc data into the shape expected by the current SDK version. |
| **Forward transform** | A function that computes a new field's value from old field(s). Always inline in the schema. |
| **Reverse transform** | A function that computes old field(s) from a new field's value. Optional; can be runtime-provided. |
| **Schema update** | A stage-agnostic, reusable definition of a schema change (e.g., adding fillColor/strokeColor). Defined once via `defineSchemaUpdate`, composed into schema versions at specific stages. |
| **Soak stage** | Migration stage where new fields exist in the Y.Doc but are not exposed to application code. Clients read old fields and dual-write old + new. |
| **Adopt stage** | Migration stage where application code reads from new fields. Clients still dual-write for backward compatibility. |
| **Finalize stage** | Migration stage where only new fields are read and written. Old fields are orphaned, deleted, or kept in sync per configuration. |
| **Additive migration** | A migration that adds a new field with no dependency on existing fields. Can skip directly to `finalize`. May include a `default` value, making the field required in the read type. |
| **Transform migration** | A migration where a new field's value is derived from one or more existing fields via a forward transform function. Must progress through `soak → adopt → finalize`. |
| **Field removal** | A migration that deprecates and hides an existing field. Follows `soak → adopt → finalize` with removal-specific semantics. The field is orphaned in the Y.Doc forever. |
| **Migration group** | All derived fields within a single `defineSchemaUpdate`. The write type requires all-or-nothing for the entire group during dual-write stages. |
| **Per-field presence** | The method by which the read lens determines whether to derive a field: check if it's present in the Y.Doc, and if not, check if its source fields are present and apply the forward transform. No version numbers are stored or tracked. |
| **Implicit carry-forward** | Schema updates not mentioned in a new version stay at their current stage. Only updates that are advancing need to be declared in `nextSchema`. |
| **Dual-write** | Writing both old and new field values simultaneously during `soak` and `adopt` stages, ensuring clients at adjacent versions can both read the data they understand. |
| **Field type descriptor** | Metadata in the migration registry describing a field's type (`primitive`, `modelRef`, `array`, `map`, `optional`). Enables the lens to recursively apply to nested record data. |
| **Schema version** | A linear integer (1, 2, 3, ...) derived from the schema chain. Each `nextSchema()` call increments it. Embedded in `DocumentModel[Metadata].version` and included on all wire messages for backend enforcement. |
| **Schema manifest** | A codegen artifact describing the full version history of a document type schema — per-version field additions, stages, defaults, and the auto-derived compatibility matrix. Consumed by the backend to compute read/write version ranges. |
| **Client schema version** | The schema version embedded in the generated SDK, included on loads, subscriptions, and updates so the backend can enforce compatibility. |
