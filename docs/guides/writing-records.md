---
sidebar_position: 3
---

# Writing Records

A document stores **records**, one per ID for each record type in your schema. Four methods on `doc` change them:

| Method         | Use it to              | If the ID exists     | If the ID is new |
| -------------- | ---------------------- | -------------------- | ---------------- |
| `createRecord` | Add a record           | Rejects              | Creates it       |
| `updateRecord` | Change some fields     | Changes them         | Rejects          |
| `setRecord`    | Replace a whole record | Replaces every field | Creates it       |
| `deleteRecord` | Remove a record        | Deletes it           | Does nothing     |

Each method returns a promise. When it rejects, nothing was written, so handle the rejection. All four also reject while the document needs a refresh (`status.data.error.requiresRefresh`).

Writes go inside a [version guard](./versioning.md#version-guards), so they only use fields the operational version supports. The examples below use the [example schema](./schemas.md#example):

```ts
import { asVersioned, matchVersion, ShapeBoxModel } from "@demo/canvas.sdk";

const doc = asVersioned(docRef);

const shapeRef = await matchVersion(doc, {
  1: doc => doc.createRecord(ShapeBoxModel, { top: 0, left: 0, color: "red" }),
  2: doc =>
    doc.createRecord(ShapeBoxModel, { top: 0, left: 0, fillColor: "red" }),
});
```

The rest of this page shows only the calls. Each one runs inside a guard like this.

## Create a record

```ts
const shapeRef = await doc.createRecord(ShapeBoxModel, { top: 0, left: 0 }); // PACK generates the ID

await doc.createRecord(ShapeBoxModel, { top: 0, left: 0 }, "shape-1"); // your own ID
await doc.createRecord(ShapeBoxModel, { top: 5, left: 5 }, "shape-1"); // rejects: shape-1 already exists
```

Either way, it returns the new record's ref, which you pass to `updateRecord` and `deleteRecord`. Pass your own ID only when you need a fixed one, such as a single settings record, or when you need the ID before the write, for example inside `withTransaction`. If two users create the same ID at the same moment, neither can see the other's record yet, so one whole record wins.

`createRecord` also rejects unless the document's data is loaded, because otherwise the app can't see every record that already exists. Subscribing, for example with `useRecords` or `onStateChange`, starts the load, and the data stays loaded only while a subscription is open. Check that `useDocumentStatus(app, docRef)?.data.load` is `"loaded"` before you create, for example to enable an "Add" button.

## Change fields

```ts
await doc.updateRecord(shapeRef, { left: 10 }); // only `left` changes
await doc.updateRecord(shapeRef, { fillColor: undefined }); // removes `fillColor`
```

Fields you don't pass are kept, including fields that a newer version of your app added. A nested object is merged field by field. An array is replaced as a whole.

## Replace a record

On an existing ID, `setRecord` deletes every field, then writes the ones you pass:

```ts
// shape-1 had { top: 0, left: 0, fillColor: "red" }
await doc.setRecord(ShapeBoxModel, "shape-1", { top: 5, left: 5 });
// shape-1 is now { top: 5, left: 5 }; fillColor is gone
```

This also deletes fields that a newer version of your app added, because your app doesn't know to pass them. To add a record, use `createRecord`. To edit one, use `updateRecord`.

## Delete a record

```ts
await doc.deleteRecord(shapeRef);
```

`deleteRecord` works the same at every version, so it doesn't need a version guard.
