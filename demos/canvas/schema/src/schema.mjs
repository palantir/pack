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

const schemaV0 = S.initialSchema(() => {
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

  const ActivityShapeAddEvent = S.defineRecord("ActivityShapeAddEvent", {
    docs: "An event representing the addition of a shape node.",
    fields: {
      nodeId: S.String,
    },
  });

  const ActivityShapeDeleteEvent = S.defineRecord("ActivityShapeDeleteEvent", {
    docs: "An event representing the deletion of a shape node.",
    fields: {
      nodeId: S.String,
    },
  });

  const ActivityShapeUpdateEvent = S.defineRecord("ActivityShapeUpdateEvent", {
    docs: "An event representing the update of a shape node.",
    fields: {
      nodeId: S.String,
      oldShape: NodeShape,
      newShape: NodeShape,
    },
  });

  const ActivityEvent = S.defineUnion("ActivityEvent", {
    discriminant: "eventType",
    docs: "An activity event describing a change to the document model.",
    variants: {
      "shapeAdd": ActivityShapeAddEvent,
      "shapeDelete": ActivityShapeDeleteEvent,
      "shapeUpdate": ActivityShapeUpdateEvent,
    },
  });

  const PresenceCursorEvent = S.defineRecord("PresenceCursorEvent", {
    docs: "Cursor position for remote user.",
    fields: {
      x: S.Double,
      y: S.Double,
    },
  });

  const PresenceSelectionEvent = S.defineRecord("PresenceSelectionEvent", {
    docs: "Selected nodes for remote user.",
    fields: {
      selectedNodeIds: S.Array(S.String),
    },
  });

  const PresenceEvent = S.defineUnion("PresenceEvent", {
    discriminant: "eventType",
    docs: "A presence event describing user cursor or selection state.",
    variants: {
      "cursor": PresenceCursorEvent,
      "selection": PresenceSelectionEvent,
    },
  });

  return {
    ActivityEvent,
    ActivityShapeAddEvent,
    ActivityShapeDeleteEvent,
    ActivityShapeUpdateEvent,
    NodeShape,
    PresenceCursorEvent,
    PresenceEvent,
    PresenceSelectionEvent,
    ShapeBox,
    ShapeCircle,
  };
});

// ============================================================================
// Schema updates (stage-agnostic change definitions)
// ============================================================================

// Additive: add opacity to shapes (default 1.0 = fully opaque)
const addOpacity = S.defineSchemaUpdate("addOpacity", schema => ({
  ShapeBox: schema.ShapeBox
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build(),
  ShapeCircle: schema.ShapeCircle
    .addField("opacity", S.Optional(S.Double), { default: 1.0 })
    .build(),
}));

// Transform: split color into separate fillColor + strokeColor
const addColorSplit = S.defineSchemaUpdate("addColorSplit", schema => ({
  ShapeBox: schema.ShapeBox
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .build(),
  ShapeCircle: schema.ShapeCircle
    .addField("fillColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .addField("strokeColor", S.Optional(S.String), {
      derivedFrom: ["color"],
      forward: ({ color }) => color,
    })
    .build(),
}));

// ============================================================================
// Schema versions
// ============================================================================

// v2: add opacity (additive, straight to finalize)
const schemaV2 = S.nextSchema(schemaV0)
  .addSchemaUpdate(addOpacity, "finalize")
  .build();

// v3: introduce color split (soak stage — read old, write both)
// Clients at v2 and v3 can collaborate: v2 reads color, v3 dual-writes color + fillColor/strokeColor.
const schemaV3 = S.nextSchema(schemaV2)
  .addSchemaUpdate(addColorSplit, "soak")
  .build();

// --- Uncomment the following versions to advance the color split migration ---

// // v4: advance color split to adopt (read new, write both)
// // Clients at v3 and v4 can collaborate: v3 reads old + dual-writes, v4 reads new + dual-writes.
// // Clients at v2 (pre-soak) are NO LONGER compatible with v4.
// const schemaV4 = S.nextSchema(schemaV3)
//   .addSchemaUpdate(addColorSplit, "adopt")
//   .build();

// // v5: finalize color split (read new, write new only)
// // Old `color` field is orphaned in the Y.Doc.
// // Clients at v3 (soak) are NO LONGER compatible with v5.
// const schemaV5 = S.nextSchema(schemaV4)
//   .addSchemaUpdate(addColorSplit, "finalize")
//   .build();

export default schemaV3;
