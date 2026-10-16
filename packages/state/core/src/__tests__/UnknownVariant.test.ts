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
  DocumentId,
  DocumentSchema,
  FieldDef,
  Model,
  ModelData,
  RecordId,
  UpgradeRegistryMap,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { BaseYjsDocumentService } from "../service/BaseYjsDocumentService.js";
import { getRecordSnapshot, setRecord } from "../service/YjsSchemaMapper.js";
import { createDocRef } from "../types/DocumentRefImpl.js";
import { getStateModule } from "../types/StateModule.js";
import { toStoredValue } from "../upgrade/UnknownVariant.js";
import { createTestApp } from "./testUtils.js";

const primitive: FieldDef = { type: { kind: "primitive" } };
const listOf = (model: string): FieldDef => ({
  type: { kind: "array", element: { kind: "modelRef", model } },
});

// This app's schema. A shape can only be a box here; a newer app also has triangles.
const upgrades: UpgradeRegistryMap = {
  Shape: { modelName: "Shape", discriminant: "shapeType", variants: { box: "Box" } },
  Box: { modelName: "Box", allFields: { left: primitive, top: primitive }, steps: [] },
  // A group of shapes on the canvas.
  Group: { modelName: "Group", allFields: { name: primitive, shapes: listOf("Shape") }, steps: [] },
  // A layer is a union too: its `group` variant is a Group.
  Layer: { modelName: "Layer", discriminant: "layerType", variants: { group: "Group" } },
  // A record, not a union, whose field names happen to match the wrapper's.
  Note: { modelName: "Note", allFields: { shapeType: primitive, rawValue: primitive }, steps: [] },
};
const GroupModel: Model = { __type: {}, zodSchema: z.object({}), [Metadata]: { name: "Group" } };
const schema = {
  Group: GroupModel,
  [Metadata]: { version: 1, upgrades },
} as unknown as DocumentSchema;

const aBox = { shapeType: "box", left: 0, top: 0 };
const triangle = { shapeType: "triangle", left: 5, top: 5 };
const wrappedTriangle = { shapeType: "unknown", rawValue: triangle };

/** Store a group holding a box and a triangle, then read it back as this app. */
function readGroup(): { name: string; shapes: unknown[] } {
  const yDoc = new Y.Doc();
  const groupId = "group-1" as RecordId;
  const storedGroup = { name: "Group 1", shapes: [aBox, triangle] };
  setRecord(yDoc, "Group", groupId, storedGroup as unknown as ModelData<Model>);
  return getRecordSnapshot(yDoc, "Group", groupId, upgrades) as { name: string; shapes: unknown[] };
}

describe("unknown union variants", () => {
  it("reads the triangle as an unknown variant", () => {
    expect(readGroup().shapes).toEqual([aBox, wrappedTriangle]);
  });

  it("puts the triangle back when the app saves what it read", () => {
    const read = readGroup();

    expect(toStoredValue(schema, "Group", { ...read, name: "Renamed" })).toEqual({
      name: "Renamed",
      shapes: [aBox, triangle],
    });
  });

  it("puts the triangle back after the app deep-copies it", () => {
    const shapes = structuredClone(readGroup().shapes);

    expect(toStoredValue(schema, "Group", { shapes })).toEqual({
      shapes: [aBox, triangle],
    });
  });

  it.each([
    ["missing", { shapeType: "unknown" }],
    ["undefined", { shapeType: "unknown", rawValue: undefined }],
    ["null", { shapeType: "unknown", rawValue: null }],
    ["an object with no shapeType", { shapeType: "unknown", rawValue: {} }],
  ])("throws when rawValue is %s", (_, wrapper) => {
    expect(() => toStoredValue(schema, "Group", { shapes: [wrapper] }))
      .toThrow("Cannot save \"unknown\" as a Shape variant: rawValue must be the stored variant.");
  });

  it("leaves a record alone even when it looks like the wrapper", () => {
    const note = { shapeType: "unknown", rawValue: "just text" };

    expect(toStoredValue(schema, "Note", note)).toEqual(note);
  });

  it("uses the saved layerType when a partial update leaves it out", () => {
    // Without the saved value, the SDK can't tell this update is for a group, so it can't find `shapes`.
    const update = { shapes: [aBox, wrappedTriangle] };
    const saved = { layerType: "group", shapes: [] };

    expect(toStoredValue(schema, "Layer", update, saved)).toEqual({
      shapes: [aBox, triangle],
    });
  });

  it("puts the triangle back in edits and presence sent through app.state", () => {
    // app.state sends these without going through setRecord, so check those paths too.
    const app = createTestApp();
    const service = app.getModule(DOCUMENT_SERVICE_MODULE_KEY) as BaseYjsDocumentService;
    const withTransaction = vi.spyOn(service, "withTransaction").mockImplementation(() => {});
    const updateCustomPresence = vi.spyOn(service, "updateCustomPresence")
      .mockImplementation(() => {});
    const docRef = createDocRef(app, "doc-1" as DocumentId, schema);
    const read = { shapes: [aBox, wrappedTriangle] };

    getStateModule(app).withTransaction(docRef, () => {}, { model: GroupModel, data: read });
    getStateModule(app).updateCustomPresence(docRef, GroupModel, read as never);

    const restored = { shapes: [aBox, triangle] };
    expect(withTransaction.mock.calls[0]![2]).toMatchObject({ data: restored });
    expect(updateCustomPresence.mock.calls[0]![2]).toEqual(restored);
  });

  it("leaves a group with no unknown shapes unchanged", () => {
    const value = { name: "Group 1", shapes: [aBox] };

    expect(toStoredValue(schema, "Group", value)).toEqual(value);
  });
});
