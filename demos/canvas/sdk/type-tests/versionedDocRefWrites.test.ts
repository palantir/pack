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

import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import {
  CanvasActivityModel,
  CursorPresenceModel,
  FreehandStrokeModel,
  matchVersion,
  ShapeBoxModel,
} from "../src/index.js";
import type {
  DocumentModel,
  NodeShape_v1,
  NodeShape_v2,
  NodeShape_v3,
  ShapeBox_v1,
  ShapeBox_v2,
  ShapeBox_v3,
  VersionedDocRef,
  VersionedDocRef_v1,
  VersionedDocRef_v2,
  VersionedDocRef_v3,
} from "../src/index.js";

declare const baseDoc: DocumentRef<DocumentModel>;
declare const versionedDoc: VersionedDocRef;
declare const docV1: VersionedDocRef_v1;
declare const docV2: VersionedDocRef_v2;
declare const docV3: VersionedDocRef_v3;

const boxV1: ShapeBox_v1 = {
  bottom: 10,
  color: "blue",
  left: 0,
  right: 10,
  top: 0,
};

const boxV2: ShapeBox_v2 = {
  bottom: 10,
  fillColor: "blue",
  left: 0,
  opacity: 1,
  right: 10,
  strokeColor: "blue",
  top: 0,
};

const boxV3: ShapeBox_v3 = {
  bottom: 10,
  fillColor: "blue",
  left: 0,
  opacity: 1,
  right: 10,
  strokeColor: "blue",
  top: 0,
};

const nodeShapeV1: NodeShape_v1 = {
  ...boxV1,
  shapeType: "box",
};

const nodeShapeV2: NodeShape_v2 = {
  ...boxV2,
  shapeType: "box",
};

const nodeShapeV3: NodeShape_v3 = {
  ...boxV3,
  shapeType: "box",
};

// Base DocumentRef write APIs are intentionally unusable until callers narrow
// through the generated version-discriminated helpers.
// @ts-expect-error Base DocumentRef cannot write custom activity payloads.
baseDoc.describeEdit(ShapeBoxModel, boxV3);
// @ts-expect-error Base DocumentRef cannot write custom presence payloads.
baseDoc.updateCustomPresence(CursorPresenceModel, { x: 1, y: 2 });

// The union remains unsafe for writes until the document is narrowed to one
// concrete operating version.
// @ts-expect-error VersionedDocRef union must be narrowed before custom activity writes.
versionedDoc.describeEdit(FreehandStrokeModel, { points: "[]" });
// @ts-expect-error VersionedDocRef union must be narrowed before custom presence writes.
versionedDoc.updateCustomPresence(FreehandStrokeModel, { points: "[]" });

docV1.describeEdit(ShapeBoxModel, boxV1);
docV1.updateCustomPresence(ShapeBoxModel, boxV1);
// @ts-expect-error v1 writes use the v1 shape payload, not v2+ shape fields.
docV1.describeEdit(ShapeBoxModel, {
  bottom: 10,
  fillColor: "blue",
  left: 0,
  opacity: 1,
  right: 10,
  strokeColor: "blue",
  top: 0,
});
// @ts-expect-error v1 writes cannot use models introduced in v3.
docV1.updateCustomPresence(FreehandStrokeModel, { points: "[]" });
// @ts-expect-error v1 activity payloads do not include the v3 summary field.
docV1.describeEdit(CanvasActivityModel, {
  activityType: "shapeUpdated",
  newShape: nodeShapeV1,
  nodeId: "shape-1",
  oldShape: nodeShapeV1,
  summary: "Updated shape shape-1",
});

docV2.describeEdit(ShapeBoxModel, boxV2);
docV2.updateCustomPresence(ShapeBoxModel, boxV2);
// @ts-expect-error v2 writes require the required opacity field added in v2.
docV2.updateCustomPresence(ShapeBoxModel, {
  bottom: 10,
  fillColor: "blue",
  left: 0,
  right: 10,
  strokeColor: "blue",
  top: 0,
});
// @ts-expect-error v2 activity payloads do not include the v3 summary field.
docV2.describeEdit(CanvasActivityModel, {
  activityType: "shapeUpdated",
  newShape: nodeShapeV2,
  nodeId: "shape-1",
  oldShape: nodeShapeV2,
  summary: "Updated shape shape-1",
});
// @ts-expect-error v2 writes cannot use models introduced in v3.
docV2.describeEdit(FreehandStrokeModel, { points: "[]" });

docV3.describeEdit(ShapeBoxModel, boxV3);
docV3.updateCustomPresence(ShapeBoxModel, boxV3);
docV3.describeEdit(FreehandStrokeModel, { points: "[]" });
docV3.updateCustomPresence(FreehandStrokeModel, { points: "[]" });
docV3.describeEdit(CanvasActivityModel, {
  activityType: "shapeUpdated",
  newShape: nodeShapeV3,
  nodeId: "shape-1",
  oldShape: nodeShapeV3,
  summary: "Updated shape shape-1",
});
// @ts-expect-error v3 shape-update activity writes require the summary field.
docV3.describeEdit(CanvasActivityModel, {
  activityType: "shapeUpdated",
  newShape: nodeShapeV3,
  nodeId: "shape-1",
  oldShape: nodeShapeV3,
});
// @ts-expect-error v3 shape writes require the v2+ shape payload.
docV3.updateCustomPresence(ShapeBoxModel, {
  bottom: 10,
  color: "blue",
  left: 0,
  right: 10,
  top: 0,
});

matchVersion(versionedDoc, {
  1: doc => {
    doc.describeEdit(CanvasActivityModel, {
      activityType: "shapeUpdated",
      newShape: nodeShapeV1,
      nodeId: "shape-1",
      oldShape: nodeShapeV1,
    });
    doc.updateCustomPresence(ShapeBoxModel, boxV1);
  },
  2: doc => {
    doc.describeEdit(CanvasActivityModel, {
      activityType: "shapeUpdated",
      newShape: nodeShapeV2,
      nodeId: "shape-1",
      oldShape: nodeShapeV2,
    });
    doc.updateCustomPresence(ShapeBoxModel, boxV2);
  },
  3: doc => {
    doc.describeEdit(CanvasActivityModel, {
      activityType: "shapeUpdated",
      newShape: nodeShapeV3,
      nodeId: "shape-1",
      oldShape: nodeShapeV3,
      summary: "Updated shape shape-1",
    });
    doc.updateCustomPresence(ShapeBoxModel, boxV3);
  },
});
