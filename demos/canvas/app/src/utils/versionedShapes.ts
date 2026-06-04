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

import type { NodeShape, NodeShape_v1, NodeShape_v2, NodeShape_v3 } from "@demo/canvas.sdk";

export function toNodeShapeV1(shape: NodeShape): NodeShape_v1 {
  const color = getShapeColor(shape);
  const base = {
    bottom: shape.bottom,
    left: shape.left,
    right: shape.right,
    top: shape.top,
    ...(color != null ? { color } : {}),
  };

  return shape.shapeType === "box"
    ? { ...base, shapeType: "box" }
    : { ...base, shapeType: "circle" };
}

export function toNodeShapeV2(shape: NodeShape): NodeShape_v2 {
  const fillColor = shape.fillColor ?? getLegacyColor(shape);
  const strokeColor = shape.strokeColor ?? fillColor;
  const base = {
    bottom: shape.bottom,
    left: shape.left,
    right: shape.right,
    top: shape.top,
    ...(fillColor != null ? { fillColor } : {}),
    ...(strokeColor != null ? { strokeColor } : {}),
    ...(shape.opacity != null ? { opacity: shape.opacity } : {}),
  };

  return shape.shapeType === "box"
    ? { ...base, shapeType: "box" }
    : { ...base, shapeType: "circle" };
}

export function toNodeShapeV3(shape: NodeShape): NodeShape_v3 {
  return toNodeShapeV2(shape);
}

function getShapeColor(shape: NodeShape): string | undefined {
  return getLegacyColor(shape) ?? shape.fillColor ?? shape.strokeColor;
}

function getLegacyColor(shape: NodeShape): string | undefined {
  return (shape as NodeShape & { readonly color?: string }).color;
}
