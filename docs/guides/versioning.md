---
sidebar_position: 3
---

# Versioning

A document type's schema can change over time. You can add fields, split one field into two or deprecate others. PACK lets one app safely read and write documents that were authored at different points in that history.

## Schema version

The **schema version** has two parts: a **major** version and a **minor** version (1.0, 1.1, 2.0, …). See [Writing a Schema](./schemas.md) for how to author these, and [Minor versions](#minor-versions) for when to use each.

For third-party document types, you update your schema with the `update-schema` command. The backend enforces that the new version is exactly one step past the currently deployed version (the next major with minor 0, or the next minor in the same major), and that the change is backwards-compatible. If you need to bypass that validation, pass `--force-overwrite`. To publish a specific step, build the IR with `type-gen schema ir --max-version <version>` first.

First-party document types don't use `update-schema`. New versions ship as document type assets (`type-gen ir asset`) with your app release. Assets don't need to be one step apart: the backend checks the new schema against every version in between, and the highest version wins.

## Reading documents

Documents aren't proactively upgraded to the latest schema version. Individual records and fields within a document may have been last written at any prior schema version. In order to simplify handling documents that contain a mix of different versions, we use a **read lens**. This lens upgrades each record to the latest schema on read, allowing for you to develop against a single, consistent schema.

You build the read lens with the generated `DocumentModel(...)` factory. Each entry supplies the values a newer version needs:

```ts
export const CanvasSchema = DocumentModel({
  ShapeBox: {
    v2: {
      fillColor: ({ color }) => color, // derived from an existing field
      strokeColor: ({ color }) => color,
      opacity: () => 0.5, // a new required field, given a default
    },
  },
});

// pass it wherever you read or write documents
const doc = useDocRef(app, CanvasSchema, canvasId);
```

The types are exhaustive: if you miss an entry (or add one that isn't needed), the `DocumentModel(...)` call fails to type-check.

### Unknown variants

A document can contain a union variant your copy of the app doesn't know, such as one added by a newer minor version. Every generated union has an extra **unknown** case for this. Its discriminant is `"unknown"`, so no real variant can use that name, and TypeScript makes you handle it wherever you check the variant:

```tsx
switch (shape.shapeType) {
  case "box":
    return <BoxShape shape={shape} />;
  case "circle":
    return <CircleShape shape={shape} />;
  case "unknown":
    return null; // added by a newer version; this copy can't draw it
}
```

When code only needs the variants your app knows, narrow first. Every union has a generated `Known<Union>` type and a `narrowKnown<Union>()` function, which returns `undefined` for an unknown value:

```ts
const shape = narrowKnownNodeShape(await shapeRef.getSnapshot()); // KnownNodeShape | undefined
if (shape == null) return; // added by a newer version
```

The unknown value keeps the stored data in `rawValue`. When you write a record, presence or activity that contains it, PACK writes the stored data back unchanged, so the newer variant isn't lost.

## Writing documents

During a rolling deploy, old and new copies of your app run side by side. All clients operating on a document must be writing at the same schema version. We call this the **operational version**. This prevents cases where newer clients are writing fields that older clients don't understand. The operational version is monotonically increasing, computed by the backend, and passed to the client in the document's metadata. Typically, this will be the highest schema version that _every_ deployed copy can handle, computed from the set of currently in-use compatibility ranges.

### Version guards

Your SDK may know a newer schema version than the one currently in operation. For example, during a rolling deploy the operational version only advances once _every_ client can handle it. You must write and expose features against the **operational version**, never writing a newer version's fields that other clients don't yet understand.

Wrap each write in a **version guard** so you only ever write fields the operational version supports. The generated `matchVersion` helper runs the branch for the document's version and hands back a `doc` with types narrowed. Each branch can only touch that version's fields, and the guard is exhaustive, so a new schema version fails to compile until you handle it everywhere.

```ts
import { asVersioned, matchVersion } from "@demo/canvas.sdk";

const doc = asVersioned(docRef);

matchVersion(doc, {
  // v1 only knows `color`.
  1: doc =>
    doc.withTransaction(() => {
      void doc.updateRecord(shapeRef, { color });
    }),
  // v2 split `color` into separate fill and stroke colors.
  2: doc =>
    doc.withTransaction(() => {
      void doc.updateRecord(shapeRef, { fillColor: color, strokeColor: color });
    }),
});
```

Likewise, features should only be displayed in the application for a newer field once the operational version has reached the version that introduced it:

```tsx
{
  doc.version >= 2
    ? (
      <>
        <ColorPicker label="Fill" value={fillColor} onChange={setFillColor} />
        <ColorPicker
          label="Stroke"
          value={strokeColor}
          onChange={setStrokeColor}
        />
      </>
    )
    : <ColorPicker label="Color" value={color} onChange={setColor} />;
}
```

### minSupportedVersion

**`minSupportedVersion`** is the oldest schema version your SDK still knows how to write.

It can be set it in `pack-config.json`:

```json
{
  "documentTypeName": "Canvas Document Type",
  "minSupportedVersion": 1
}
```

Raising it will drop support for writing older versions of the document, and the SDK will not generate their types. Leave it out and the SDK supports only the latest version.

### Compatibility Range

Each generated build declares which schema versions it can read and write as a **compatibility range**. `min` defaults to your `minSupportedVersion` and `max` to the latest version. The range, the operational version and `doc.version` only use major versions.

## Minor versions

A **minor version** (e.g. 1.0 → 1.1) adds new things without waiting for every copy of your app to upgrade. Declare one with `{ bump: "minor" }`:

```js
const schemaV1_1 = S.nextSchema(schemaV1, { bump: "minor" })
  .addSchemaUpdate(addShapeLabel)
  .build();
```

How it differs from a major version:

|                    | Major (1.x → 2.0)                           | Minor (1.0 → 1.1)                                    |
| ------------------ | ------------------------------------------- | ---------------------------------------------------- |
| Writing new fields | Only once the operational version reaches 2 | Right away, while `doc.version` is 1                 |
| Older apps         | Must upgrade before the new fields are used | Keep editing; they ignore the new fields             |
| Allowed changes    | Any supported change                        | Add fields, new records or unions                    |
| Generated types    | A new `_v2` set of types                    | The new fields are added to the existing `_v1` types |

Because older apps on the same major keep editing during a minor version, they never write the new fields. A new required field works the same as in a major version: give it a default in `DocumentModel(...)`, keyed by the minor version, and the read lens fills it in for records written by older apps:

```ts
export const CanvasSchema = DocumentModel({
  ShapeBox: {
    v1_1: { zIndex: () => 0 }, // a required field added in 1.1
  },
});
```

In a minor version:

- New fields can't use `derivedFrom`: older apps keep editing the source field and never update the derived one.
- Fields can't be deprecated: newer apps stop writing the field while older apps still read it.
- Union variants can't be added or removed. The server doesn't accept new variants on an existing union yet.

`build()` throws if a minor version breaks one of these rules; use a major version instead. No version guard is needed for minor-version fields — write them in the existing branch for that major:

```ts
matchVersion(doc, {
  1: doc => doc.updateRecord(shapeRef, { label }), // `label` was added in 1.1
});
```
