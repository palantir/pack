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
  Model,
  ModelData,
  RecordId,
  UnionUpgradeRegistry,
  UpgradeRegistry,
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
import { restoreUnknownVariants } from "../upgrade/UnknownVariant.js";
import { createTestApp } from "./testUtils.js";

// This app knows one shape type, `box`. A newer app added `triangle`.
const shapeUnion: UnionUpgradeRegistry = {
  modelName: "Shape",
  discriminant: "shapeType",
  variants: { box: "Box" },
};
const box: UpgradeRegistry = {
  modelName: "Box",
  allFields: { left: { type: { kind: "primitive" } }, top: { type: { kind: "primitive" } } },
  steps: [],
};
// A group of shapes on the canvas.
const group: UpgradeRegistry = {
  modelName: "Group",
  allFields: {
    name: { type: { kind: "primitive" } },
    shapes: { type: { kind: "array", element: { kind: "modelRef", model: "Shape" } } },
    status: { type: { kind: "primitive" } },
    rawValue: { type: { kind: "primitive" } },
  },
  steps: [],
};
// A canvas layer, whose `group` variant holds a list of shapes.
const layerUnion: UnionUpgradeRegistry = {
  modelName: "Layer",
  discriminant: "layerType",
  variants: { group: "Group" },
};
const upgrades: UpgradeRegistryMap = {
  Shape: shapeUnion,
  Box: box,
  Group: group,
  Layer: layerUnion,
};
const GroupModel: Model = { __type: {}, zodSchema: z.object({}), [Metadata]: { name: "Group" } };
const schema = {
  Group: GroupModel,
  [Metadata]: { version: 1, upgrades },
} as unknown as DocumentSchema;

const aBox = { shapeType: "box", left: 0, top: 0 };
const triangle = { shapeType: "triangle", left: 5, top: 5 };
const groupId = "group-1" as RecordId;

/** Store a group with a box and a triangle, then read it back as this app. */
function readGroup(): { name: string; shapes: unknown[] } {
  const yDoc = new Y.Doc();
  const storedGroup = { name: "Group 1", shapes: [aBox, triangle] };
  setRecord(yDoc, "Group", groupId, storedGroup as unknown as ModelData<Model>);
  return getRecordSnapshot(yDoc, "Group", groupId, upgrades) as { name: string; shapes: unknown[] };
}

describe("unknown union variants", () => {
  it("reads a shape type this app doesn't know as an unknown variant", () => {
    const { shapes } = readGroup();

    expect(shapes).toEqual([aBox, { shapeType: "unknown", rawValue: triangle }]);
  });

  it("puts the triangle back when the app saves what it read", () => {
    const read = readGroup();

    expect(restoreUnknownVariants(schema, "Group", { ...read, name: "Renamed" })).toEqual({
      name: "Renamed",
      shapes: [aBox, triangle],
    });
  });

  it("puts the triangle back after the app deep-copies it", () => {
    const { shapes } = readGroup();

    expect(restoreUnknownVariants(schema, "Group", { shapes: structuredClone(shapes) })).toEqual({
      shapes: [aBox, triangle],
    });
  });

  it("throws when an unknown variant has no stored value", () => {
    expect(() => restoreUnknownVariants(schema, "Group", { shapes: [{ shapeType: "unknown" }] }))
      .toThrow("Cannot save \"unknown\" as a Shape variant without a rawValue.");
  });

  it("leaves non-union fields unchanged even when they look like an unknown variant", () => {
    const value = { status: "unknown", rawValue: { status: "ready" } };

    expect(restoreUnknownVariants(schema, "Group", value)).toEqual(value);
  });

  it("uses the saved record to find the variant when a partial update leaves it out", () => {
    const { shapes } = readGroup();

    expect(
      restoreUnknownVariants(schema, "Layer", { shapes }, { layerType: "group", shapes: [] }),
    ).toEqual({ shapes: [aBox, triangle] });
  });

  it("puts the triangle back in edit descriptions and presence sent through app.state", () => {
    const app = createTestApp();
    const service = app.getModule(DOCUMENT_SERVICE_MODULE_KEY) as BaseYjsDocumentService;
    const withTransaction = vi.spyOn(service, "withTransaction").mockImplementation(() => {});
    const updateCustomPresence = vi.spyOn(service, "updateCustomPresence")
      .mockImplementation(() => {});
    const stateModule = getStateModule(app);
    const docRef = createDocRef(app, "doc-1" as DocumentId, schema);
    const { shapes } = readGroup();
    const restored = { shapes: [aBox, triangle] };

    stateModule.withTransaction(docRef, () => {}, { model: GroupModel, data: { shapes } });
    stateModule.updateCustomPresence(docRef, GroupModel, { shapes } as never);

    expect(withTransaction.mock.calls[0]![2]).toMatchObject({ data: restored });
    expect(updateCustomPresence.mock.calls[0]![2]).toEqual(restored);
  });

  it("leaves a value without unknown variants unchanged", () => {
    const value = { name: "Group 1", shapes: [aBox] };

    expect(restoreUnknownVariants(schema, "Group", value)).toEqual(value);
  });
});
