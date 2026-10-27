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

import type { KnownNodeShape, NodeShape_v1, NodeShape_v2, NodeShape_v3 } from "@demo/canvas.sdk";

export function toNodeShapeV1(shape: KnownNodeShape): NodeShape_v1 {
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

export function toNodeShapeV2(shape: KnownNodeShape): NodeShape_v2 {
  const base = getShapeV2Base(shape);

  return shape.shapeType === "box"
    ? { ...base, shapeType: "box" }
    : { ...base, shapeType: "circle" };
}

export function toNodeShapeV3(shape: KnownNodeShape): NodeShape_v3 {
  const base = {
    ...getShapeV2Base(shape),
    title: shape.title,
    ...(shape.label != null ? { label: shape.label } : {}),
  };

  return shape.shapeType === "box"
    ? { ...base, shapeType: "box" }
    : { ...base, shapeType: "circle" };
}

function getShapeV2Base(shape: KnownNodeShape) {
  const fillColor = shape.fillColor ?? getLegacyColor(shape);
  const strokeColor = shape.strokeColor ?? fillColor;
  return {
    bottom: shape.bottom,
    left: shape.left,
    right: shape.right,
    top: shape.top,
    opacity: shape.opacity,
    ...(fillColor != null ? { fillColor } : {}),
    ...(strokeColor != null ? { strokeColor } : {}),
  };
}

function getShapeColor(shape: KnownNodeShape): string | undefined {
  return getLegacyColor(shape) ?? shape.fillColor ?? shape.strokeColor;
}

function getLegacyColor(shape: KnownNodeShape): string | undefined {
  return (shape as KnownNodeShape & { readonly color?: string }).color;
}
