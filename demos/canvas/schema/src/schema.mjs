/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
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

import * as S from "@palantir/pack.schema";

// @ts-check

const SHAPE_COMMON = {
  bottom: S.Double,
  left: S.Double,
  right: S.Double,
  top: S.Double,

  color: S.Optional(S.String),
};

function defineShapeModels() {
  const ShapeCircle = S.defineRecord("ShapeCircle", {
    docs: "A circle.",
    fields: SHAPE_COMMON,
  });

  const ShapeBox = S.defineRecord("ShapeBox", {
    docs: "A box.",
    fields: SHAPE_COMMON,
  });

  const NodeShape = S.defineUnion("NodeShape", {
    discriminant: "shapeType",
    docs: "The shape of a node.",
    variants: {
      "box": ShapeBox,
      "circle": ShapeCircle,
    },
  });

  return {
    NodeShape,
    ShapeBox,
    ShapeCircle,
  };
}

function defineActivityModels(NodeShape) {
  const ShapeAddedActivity = S.defineRecord("ShapeAddedActivity", {
    docs: "Activity payload for a shape addition.",
    fields: {
      nodeId: S.String,
    },
  });

  const ShapeDeletedActivity = S.defineRecord("ShapeDeletedActivity", {
    docs: "Activity payload for a shape deletion.",
    fields: {
      nodeId: S.String,
    },
  });

  const ShapeUpdatedActivity = S.defineRecord("ShapeUpdatedActivity", {
    docs: "Activity payload for a shape update.",
    fields: {
      nodeId: S.String,
      oldShape: NodeShape,
      newShape: NodeShape,
    },
  });

  const CanvasActivity = S.defineUnion("CanvasActivity", {
    discriminant: "activityType",
    docs: "Canvas-specific custom activity payload.",
    variants: {
      "shapeAdded": ShapeAddedActivity,
      "shapeDeleted": ShapeDeletedActivity,
      "shapeUpdated": ShapeUpdatedActivity,
    },
  });

  return {
    CanvasActivity,
    ShapeAddedActivity,
    ShapeDeletedActivity,
    ShapeUpdatedActivity,
  };
}

function definePresenceModels() {
  const CursorPresence = S.defineRecord("CursorPresence", {
    docs: "Cursor position for a remote user.",
    fields: {
      x: S.Double,
      y: S.Double,
    },
  });

  const SelectionPresence = S.defineRecord("SelectionPresence", {
    docs: "Selected shape ids for a remote user.",
    fields: {
      selectedNodeIds: S.Array(S.String),
    },
  });

  return {
    CursorPresence,
    SelectionPresence,
  };
}

const shapeModels = defineShapeModels();
const activityModels = defineActivityModels(shapeModels.NodeShape);
const presenceModels = definePresenceModels();

const schemaV1 = S.defineSchema({
  ...shapeModels,
  ...activityModels,
  ...presenceModels,
});

// --- Schema change: color split ---
const splitShapeColorIntoFillAndStroke = S.defineSchemaUpdate(
  "splitShapeColorIntoFillAndStroke",
  schema => {
    const ShapeBox = schema.ShapeBox
      .addField("fillColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .addField("strokeColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .deprecateField("color", "Use fillColor and strokeColor instead.")
      .build();

    const ShapeCircle = schema.ShapeCircle
      .addField("fillColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .addField("strokeColor", S.Optional(S.String), { derivedFrom: ["color"] })
      .deprecateField("color", "Use fillColor and strokeColor instead.")
      .build();

    return { ShapeBox, ShapeCircle };
  },
);

// --- Schema change: add opacity (additive, required) ---
// The field is required at v2 — its value can never be undefined under the v2
// type. The app provides `opacity: () => 1.0` at boot so the read lens
// back-fills v1 documents.
const addShapeOpacity = S.defineSchemaUpdate("addShapeOpacity", schema => {
  const ShapeBox = schema.ShapeBox
    .addField("opacity", S.Double)
    .build();

  const ShapeCircle = schema.ShapeCircle
    .addField("opacity", S.Double)
    .build();

  return { ShapeBox, ShapeCircle };
});

// --- Schema v2: apply both changes ---
const schemaV2 = S.nextSchema(schemaV1)
  .addSchemaUpdate(splitShapeColorIntoFillAndStroke)
  .addSchemaUpdate(addShapeOpacity)
  .build();

// --- Schema change: add freehand strokes (purely additive) ---
const addFreehandStrokeModel = S.defineSchemaUpdate("addFreehandStrokeModel", () => {
  const FreehandStroke = S.defineRecord("FreehandStroke", {
    docs: "A freehand pen stroke stored as a JSON-encoded array of [x, y, pressure] tuples.",
    fields: {
      points: S.String,
      color: S.Optional(S.String),
    },
  });
  return { FreehandStroke };
});

// --- Schema change: add a derived shape-update activity summary ---
const addShapeUpdatedActivitySummary = S.defineSchemaUpdate(
  "addShapeUpdatedActivitySummary",
  schema => {
    const ShapeUpdatedActivity = schema.ShapeUpdatedActivity
      .addField("summary", S.String, { derivedFrom: ["nodeId"] })
      .build();

    return { ShapeUpdatedActivity };
  },
);

// --- Schema v3: add pen tool support ---
const schemaV3 = S.nextSchema(schemaV2)
  .addSchemaUpdate(addFreehandStrokeModel)
  .addSchemaUpdate(addShapeUpdatedActivitySummary)
  .build();

export default schemaV3;
