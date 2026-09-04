---
sidebar_position: 3
---

# Versioning

A document type's schema can change over time. You can add fields, split one field into two or deprecate others. PACK lets one app safely read and write documents that were authored at different points in that history.

## Schema version

The **schema version** is a monotonically increasing integer (v1, v2, v3, …). See [Writing a Schema](./schemas.md) for how to author these.

When you deploy, the backend enforces that the new version is exactly one higher than the currently deployed version, and that the change is backwards-compatible. If you need to bypass that validation, pass `--force-overwrite`.

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

## Writing documents

During a rolling deploy, old and new copies of your app run side by side. All clients operating on a document must be writing at the same schema version. We call this the **operational version**. This prevents cases where newer clients are writing fields that older clients don't understand. The operational version is monotonically increasing, computed by the backend, and passed to the client. Typically, this will be the highest schema version that _every_ deployed copy can handle, computed from the set of currently in-use compatibility ranges.

### Version guards

Your SDK may know a newer schema version than the one currently in operation. For example, during a rolling deploy the operational version only advances once _every_ client can handle it. You must write and expose features against the **operational version**, never writing a newer version's fields that other clients don't yet understand.

Wrap each write in a **version guard** so you only ever write fields the operational version supports. The generated `matchVersion` helper runs the branch for the document's version and hands back a `doc` with types narrowed. Each branch can only touch that version's fields, and the guard is exhaustive, so a new schema version fails to compile until you handle it everywhere.

```ts
import { matchVersion } from "@demo/canvas.sdk";

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

Each generated build declares which schema versions it can read and write as a **compatibility range**. `min` defaults to your `minSupportedVersion` and `max` to the latest version.
