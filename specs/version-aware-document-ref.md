## Version-Aware DocumentRef

### Problem

The current implementation introduces `VersionedDocRef` — a wrapper object that holds a `DocumentRef` at `.ref` and adds version-discriminated write methods. This forces every consumer to track two objects: `doc` for writes and `doc.ref` for framework hooks (`useRecords`, `useDocMetadata`, `useBroadcastPresence`, etc.). The `.ref` accessor is a constant source of friction and an easy mistake to make.

The root cause: `DocumentRef` has no concept of the document's operating version, and its write surface area is limited to `withTransaction`. Version-specific writes live on a separate generated object because the framework type doesn't have a place for them.

### Goal

Eliminate `VersionedDocRef` as a separate concept. The consumer holds a single `DocumentRef`-shaped object that works everywhere: framework hooks accept it for reads/subscriptions, and `switch (doc.version)` narrows it for type-safe version-specific writes. No `.ref`, no wrapper, no second object.

Critically, **the developer must be forced to check the version before performing any write**. A raw `DocumentRef` without version narrowing must not permit writes — this prevents accidentally writing latest-version data to a document operating at an older version.

### Design

#### 1. Add write methods and version to DocumentRef — with `never` data params

`DocumentRef<D>` gains four new members. The write methods use `never` for their data parameters, making them impossible to call without version narrowing:

```typescript
interface DocumentRef<D extends DocumentSchema = DocumentSchema> {
  // ... existing members (id, schema, getRecords, withTransaction, etc.) ...

  /** The document's current operating schema version. */
  readonly version: number;

  /**
   * Update fields on an existing record.
   *
   * The data parameter is typed as `never` on the base interface — you must
   * narrow the ref to a version-specific type (via the generated SDK's
   * `asVersioned` + `switch (doc.version)`) before calling this method.
   */
  updateRecord(ref: RecordRef, data: never): void;

  /**
   * Create or replace a record in a collection.
   *
   * The data parameter is typed as `never` on the base interface — you must
   * narrow to a version-specific type before calling this method.
   */
  setCollectionRecord(model: Model, id: RecordId, data: never): void;

  /** Delete a record. Version-agnostic — callable without narrowing. */
  deleteRecord<M extends Model>(ref: RecordRef<M>): void;
}
```

The `never` data parameter means:
- `docRef.updateRecord(ref, { color: "red" })` is a **type error** — `{ color: "red" }` is not assignable to `never`.
- `docRef.deleteRecord(ref)` works — it has no version-dependent data parameter.
- The developer is forced to narrow via `asVersioned` + `switch (doc.version)` to unlock writes.

#### 2. DocumentRefImpl adds the runtime methods

```typescript
class DocumentRefImpl<T extends DocumentSchema> implements DocumentRef<T> {
  // ... existing implementation ...

  get version(): number {
    // Read from document metadata provided by the backend.
    // For new documents, this is set during creation (see section 5).
    return this.documentSchemaVersion;
  }

  updateRecord(ref: RecordRef, data: unknown): void {
    ref.update(data as any);
  }

  setCollectionRecord(model: Model, id: RecordId, data: unknown): void {
    const collection = this.getRecords(model);
    collection.set(id, data as any);
  }

  deleteRecord<M extends Model>(ref: RecordRef<M>): void {
    ref.delete();
  }
}
```

The runtime accepts `unknown` — it's the type system that enforces correctness, not runtime validation. The `never` on the interface prevents misuse at compile time; the `unknown` in the implementation allows the generated overloads to pass through any version-appropriate data.

#### 3. Codegen produces version-specific overloads that unlock writes

For a schema with `minSupportedVersion: 1` and latest version 2, the codegen produces:

```typescript
// versionedDocRef.ts (generated)

export interface CanvasDocRef_v1 extends DocumentRef<DocumentModel> {
  readonly version: 1;

  // These overloads resolve BEFORE the base interface's `never` signatures,
  // unlocking writes with version-appropriate types.
  updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v1): void;
  updateRecord(ref: RecordRef<typeof ShapeCircleModel>, data: ShapeCircleUpdate_v1): void;
  updateRecord(ref: RecordRef<typeof NodeShapeModel>, data: Partial<NodeShape_v1>): void;
  updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): void;

  setCollectionRecord(model: typeof NodeShapeModel, id: RecordId, data: NodeShape_v1): void;
  setCollectionRecord(model: typeof ShapeBoxModel, id: RecordId, data: ShapeBox_v1): void;
  setCollectionRecord(model: typeof ShapeCircleModel, id: RecordId, data: ShapeCircle_v1): void;
  setCollectionRecord<M extends Model>(model: M, id: RecordId, data: ModelData<M>): void;
}

export interface CanvasDocRef_v2 extends DocumentRef<DocumentModel> {
  readonly version: 2;

  updateRecord(ref: RecordRef<typeof ShapeBoxModel>, data: ShapeBoxUpdate_v2): void;
  updateRecord(ref: RecordRef<typeof ShapeCircleModel>, data: ShapeCircleUpdate_v2): void;
  updateRecord(ref: RecordRef<typeof NodeShapeModel>, data: Partial<NodeShape_v2>): void;
  updateRecord<M extends Model>(ref: RecordRef<M>, data: Partial<ModelData<M>>): void;

  setCollectionRecord(model: typeof NodeShapeModel, id: RecordId, data: NodeShape_v2): void;
  setCollectionRecord(model: typeof ShapeBoxModel, id: RecordId, data: ShapeBox_v2): void;
  setCollectionRecord(model: typeof ShapeCircleModel, id: RecordId, data: ShapeCircle_v2): void;
  setCollectionRecord<M extends Model>(model: M, id: RecordId, data: ModelData<M>): void;
}

export type CanvasDocRef = CanvasDocRef_v1 | CanvasDocRef_v2;
```

Each variant extends `DocumentRef<DocumentModel>`, so it is assignable to `DocumentRef` and works with every framework hook unchanged. The version-specific overloads resolve before the base `never` signatures, unlocking writes only after narrowing.

#### 4. Type narrowing is the only generated runtime code

The generated SDK exports a single identity function:

```typescript
export function asVersioned(docRef: DocumentRef<DocumentModel>): CanvasDocRef {
  return docRef as CanvasDocRef;
}
```

At runtime this is a no-op — the cast is safe because `DocumentRefImpl` already has `version`, `updateRecord`, `setCollectionRecord`, and `deleteRecord` as real methods. The generated type only adds version-specific overloads that TypeScript resolves at compile time.

#### 5. The type safety guarantee

The `never` parameter creates a clear two-gate system:

| What the developer holds | Can read? | Can write? | How to unlock writes |
|---|---|---|---|
| `DocumentRef<DocumentModel>` | Yes | No — `data: never` blocks all writes | Call `asVersioned(docRef)` |
| `CanvasDocRef` (union, not narrowed) | Yes | No — union of incompatible overloads, TS can't resolve | `switch (doc.version)` |
| `CanvasDocRef_v1` (narrowed) | Yes | Yes — v1 overloads resolve | Already narrowed |
| `CanvasDocRef_v2` (narrowed) | Yes | Yes — v2 overloads resolve | Already narrowed |

The developer must pass through both gates — `asVersioned` then `switch` — before any write compiles. This makes it impossible to accidentally write latest-version data to an older document.

#### 6. Document creation

`StateModule.createDocument` accepts an optional `initializer` callback:

```typescript
createDocument<T extends DocumentSchema>(
  metadata: CreateDocumentMetadata,
  schema: T,
  initializer?: (docRef: DocumentRef<T>, version: number) => void | Promise<void>,
): Promise<DocumentRef<T>>;
```

The framework determines the creation version (initially `minSupportedVersion`, future: backend-negotiated). The consumer narrows inside the callback if they need version-specific initial data:

```typescript
const docRef = await app.state.createDocument(metadata, DocumentModel, (docRef, version) => {
  const doc = asVersioned(docRef);
  switch (doc.version) {
    case 1:
      doc.setCollectionRecord(NodeShapeModel, id, { ...bounds, color, shapeType: "box" });
      break;
    case 2:
      doc.setCollectionRecord(NodeShapeModel, id, { ...bounds, fillColor, strokeColor, opacity: 1, shapeType: "box" });
      break;
  }
});
```

For documents with no initial data (like the canvas demo), the callback is omitted entirely.

### Consumer DX

#### Setup (one-time, in the app's hook file)

```typescript
// pack.ts
import { asVersioned, DocumentModel } from "@demo/canvas.sdk";
import type { CanvasDocRef } from "@demo/canvas.sdk";

export function useCanvasDocRef(app: WithStateModule<PackApp>, canvasId: DocumentId | undefined): CanvasDocRef {
  return asVersioned(useDocRef(app, DocumentModel, canvasId));
}
```

#### Reading (no version thinking)

```typescript
const doc = useCanvasDocRef(app, canvasId);

// Framework hooks accept doc directly — no .ref needed
const shapes = useRecords(doc, NodeShapeModel);
const { metadata } = useDocMetadata(doc);
const record = useRecord(shapeRef); // always latest types via lens
```

#### Writing — must narrow first

```typescript
const doc = useCanvasDocRef(app, canvasId);

// This is a type error — data param is `never` on the union:
// doc.updateRecord(shapeRef, { color });  // TS error

// Must narrow first:
switch (doc.version) {
  case 1:
    doc.updateRecord(shapeRef, { color });          // compiles
    break;
  case 2:
    doc.updateRecord(shapeRef, { fillColor: color, strokeColor: color });  // compiles
    break;
}
```

#### What happens if the developer forgets `asVersioned`

```typescript
const docRef = useDocRef(app, DocumentModel, canvasId);

// Reads work fine:
const shapes = useRecords(docRef, NodeShapeModel);  // compiles

// Writes are blocked:
docRef.updateRecord(shapeRef, { color });  // TS error: '{ color: string }' is not assignable to 'never'

// deleteRecord still works (version-agnostic):
docRef.deleteRecord(shapeRef);  // compiles
```

The error message makes the fix obvious — the developer sees `never` and knows they need to version-narrow.

#### Adding a new schema version

When v3 is added to the schema:

1. Codegen adds `CanvasDocRef_v3` to the union.
2. Every `switch (doc.version)` that touches a changed model becomes a compile error — TypeScript's exhaustiveness check flags the missing `case 3:`.
3. Only write paths for models whose fields changed in v3 need updating. Unchanged models use the generic fallback and compile without changes.
4. Read paths are untouched — `NodeShape` silently becomes `NodeShape_v3`, and the lens migrates old data.

### Changes Required

| Package | Change |
|---------|--------|
| `@palantir/pack.document-schema.model-types` | Add `version: number`, `updateRecord(ref, data: never)`, `setCollectionRecord(model, id, data: never)`, `deleteRecord(ref)` to the `DocumentRef` interface. |
| `@palantir/pack.state.core` | Implement the new methods on `DocumentRefImpl` (runtime accepts `unknown`). `version` reads the document's operating version from the backend-provided document state. |
| `@palantir/pack.document-schema.type-gen` | Update the codegen to emit per-version interfaces extending `DocumentRef<DocumentModel>` (not a separate base type), plus the `asVersioned` identity function. Remove `VersionedDocRefBase`, `withTransaction` delegation, `deleteRecord` delegation. |
| `demos/canvas/sdk` | Regenerated. Types extend `DocumentRef<DocumentModel>`. `createVersionedDocRef` replaced with `asVersioned`. |
| `demos/canvas/app` | Remove all `.ref` accesses. `useCanvasDocRef` returns `asVersioned(useDocRef(...))`. Framework hooks receive `doc` directly. |
| `@palantir/pack.state.react` | `createDocumentScope` can be deprecated. No changes to `useRecords`, `useRecord`, `useDocMetadata`, etc. — they already accept `DocumentRef`. |

### What This Eliminates

- The `VersionedDocRef` wrapper type and its `VersionedDocRefBase` interface
- The `.ref` accessor pattern and the "which one do I pass?" decision
- The `createVersionedDocRef` factory function and its closure-based delegation
- The composition object allocation on every `useMemo`
- The `DocumentScopeProvider` React context (already removed, this ensures it stays gone)
- The possibility of writing latest-version data without a version check

### What This Preserves

- The discriminated union pattern for version narrowing (`switch (doc.version)`)
- The codegen producing per-version write overloads
- The framework owning version selection logic (`createDocument` callback)
- Type exhaustiveness checking when new versions are added
- The principle that reads are always latest types via the lens
- Full backwards compatibility for single-version schemas (no `asVersioned` needed if you never version your schema — but writes are blocked by `never` until you do)
