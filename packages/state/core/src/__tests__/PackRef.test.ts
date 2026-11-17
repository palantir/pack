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

import type {
  DocumentSchema,
  FieldDef,
  FieldTypeDescriptor,
  Model,
  ModelData,
  RecordId,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getRecordSnapshot, setRecord, updateRecord } from "../service/YjsSchemaMapper.js";
import { toStoredValue } from "../upgrade/UnknownVariant.js";

const primitive: FieldDef = { type: { kind: "primitive" } };
const resourceIdentifierRef: FieldTypeDescriptor = { kind: "packRef", refType: "resourceRef" };

const upgrades: UpgradeRegistryMap = {
  Assignment: {
    modelName: "Assignment",
    allFields: {
      doc: { type: { kind: "packRef", refType: "docRef" } },
      owner: { type: { kind: "packRef", refType: "userRef" } },
      linked: { type: { kind: "packRef", refType: "objectRef" } },
    },
    steps: [],
  },
  Binding: {
    modelName: "Binding",
    allFields: {
      resource: primitive,
      resourceIdentifier: { type: { kind: "optional", inner: resourceIdentifierRef } },
    },
    steps: [],
  },
  Tile: {
    modelName: "Tile",
    allFields: {
      resources: { type: { kind: "array", element: resourceIdentifierRef } },
      target: { type: { kind: "modelRef", model: "Target" } },
    },
    steps: [],
  },
  Target: { modelName: "Target", discriminant: "type", variants: { resource: "ResourceTarget" } },
  ResourceTarget: {
    modelName: "ResourceTarget",
    allFields: { type: primitive, rid: { type: resourceIdentifierRef } },
    steps: [],
  },
};
const schema = { [Metadata]: { version: 1, upgrades } } as unknown as DocumentSchema;

const recordId = "binding-1" as RecordId;
const tagged = (id: string, type = "resourceRef") => ({ __packRef: 1, __type: type, __ref: id });

/** Save as the SDK does: convert to the stored value, then write it to Yjs. */
function save(yDoc: Y.Doc, modelName: string, id: RecordId, value: object): void {
  setRecord(yDoc, modelName, id, toStoredValue(schema, modelName, value) as ModelData<Model>);
}

/** The items each update carries: the key each one sets (if any) and its JSON content. */
function recordUpdates(yDoc: Y.Doc): Array<Array<{ key: string | null; content: unknown }>> {
  const updates: Array<Array<{ key: string | null; content: unknown }>> = [];
  yDoc.on("update", (update: Uint8Array) => {
    updates.push(
      Y.decodeUpdate(update).structs.map(struct => {
        const item = struct as Y.Item;
        return { key: item.parentSub, content: item.content.getContent()[0] as unknown };
      }),
    );
  });
  return updates;
}

describe("ResourceIdentifierRef", () => {
  it("stores the ref string as one tagged value, so each update carries the whole ref", () => {
    const yDoc = new Y.Doc();
    const updates = recordUpdates(yDoc);

    save(yDoc, "Binding", recordId, { resource: "ri.a", resourceIdentifier: "ri.a" });

    expect(updates[0]).toContainEqual({ key: "resourceIdentifier", content: tagged("ri.a") });
    // The plain ResourceRef next to it is unchanged.
    expect(updates[0]).toContainEqual({ key: "resource", content: "ri.a" });
  });

  it("replaces the whole ref on a partial update", () => {
    const yDoc = new Y.Doc();
    save(yDoc, "Binding", recordId, { resource: "ri.a", resourceIdentifier: "ri.a" });
    const updates = recordUpdates(yDoc);

    const partial = toStoredValue(schema, "Binding", { resourceIdentifier: "ri.b" });
    updateRecord(yDoc, "Binding", recordId, partial);

    // A replacement carries no key, only the value, so the value alone must say it is a ref.
    expect(updates[0]).toEqual([{ key: null, content: tagged("ri.b") }]);
  });

  it("reads the ref string back, inside lists and union variants too", () => {
    const yDoc = new Y.Doc();
    const tile = { resources: ["ri.a", "ri.b"], target: { type: "resource", rid: "ri.c" } };

    save(yDoc, "Tile", "tile-1" as RecordId, tile);

    expect(yDoc.getMap("Tile").toJSON()["tile-1"]).toEqual({
      resources: [tagged("ri.a"), tagged("ri.b")],
      target: { type: "resource", rid: tagged("ri.c") },
    });
    expect(getRecordSnapshot(yDoc, "Tile", "tile-1" as RecordId, upgrades)).toEqual(tile);
  });
});

describe("DocRef, UserRef, and ObjectRef", () => {
  const docId = "ri.backpack.main.document.abc";
  const userId = "0d1fe74e-2b70-4a93-9b1a-80070637788b";
  const objectRid = "ri.phonograph2-objects.main.object.abc";
  const assignmentId = "assignment-1" as RecordId;

  it("stores each ref tagged with its own __type, and reads the ref string back", () => {
    const yDoc = new Y.Doc();
    save(yDoc, "Assignment", assignmentId, { doc: docId, owner: userId, linked: objectRid });

    // Backpack only accepts a tagged value whose __type matches the field's kind.
    expect(yDoc.getMap("Assignment").toJSON()[assignmentId]).toEqual({
      doc: tagged(docId, "docRef"),
      owner: tagged(userId, "userRef"),
      linked: tagged(objectRid, "objectRef"),
    });
    expect(getRecordSnapshot(yDoc, "Assignment", assignmentId, upgrades)).toEqual({
      doc: docId,
      owner: userId,
      linked: objectRid,
    });
  });
});
