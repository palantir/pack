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

import type { NodeShapeModel } from "@demo/canvas.sdk";
import type { RecordRef } from "@palantir/pack.document-schema.model-types";
import { useRecord } from "@palantir/pack.state.react";
import type { MouseEvent } from "react";
import { memo } from "react";
import { boundsToCenter } from "../../utils/boundsToCenter.js";
import { getResizeHandles } from "../../utils/getResizeHandles.js";
import styles from "./CanvasContent.module.css";

const PRIMARY_COLOR = "#0066cc";
const DEFAULT_SHAPE_COLOR = "#000000";

export interface CanvasContentProps {
  readonly canvasProps: {
    onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseUp: (e: MouseEvent<SVGSVGElement>) => void;
  };
  readonly selectedShapeId: string | undefined;
  readonly shapeRefs: readonly RecordRef<typeof NodeShapeModel>[];
}

const ShapeRenderer = memo(function ShapeRenderer({
  shapeRef,
  selectedShapeId,
}: {
  shapeRef: RecordRef<typeof NodeShapeModel>;
  selectedShapeId: string | undefined;
}) {
  const { data: shape } = useRecord(shapeRef);

  if (shape == null) return null;

  const isSelected = shapeRef.id === selectedShapeId;
  const color = shape.color ?? DEFAULT_SHAPE_COLOR;
  const fillColor = `${color}4D`;

  if (shape.shapeType === "box") {
    return (
      <g key={shapeRef.id}>
        <rect
          fill={fillColor}
          height={shape.bottom - shape.top}
          stroke={color}
          strokeWidth={2}
          width={shape.right - shape.left}
          x={shape.left}
          y={shape.top}
        />
        {isSelected && (
          <>
            <rect
              fill="none"
              height={shape.bottom - shape.top}
              stroke={PRIMARY_COLOR}
              strokeWidth={2}
              width={shape.right - shape.left}
              x={shape.left}
              y={shape.top}
            />
            {getResizeHandles(shape).map(({ handle, x, y }) => (
              <circle
                key={handle}
                cx={x}
                cy={y}
                fill={handle === "center" ? PRIMARY_COLOR : "white"}
                r={5}
                stroke={PRIMARY_COLOR}
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </g>
    );
  }

  const { centerX, centerY, height, width } = boundsToCenter(shape);
  const rx = width / 2;
  const ry = height / 2;

  return (
    <g key={shapeRef.id}>
      <ellipse
        cx={centerX}
        cy={centerY}
        fill={fillColor}
        rx={rx}
        ry={ry}
        stroke={color}
        strokeWidth={2}
      />
      {isSelected && (
        <>
          <ellipse
            cx={centerX}
            cy={centerY}
            fill="none"
            rx={rx}
            ry={ry}
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
          />
          {getResizeHandles(shape).map(({ handle, x, y }) => (
            <circle
              key={handle}
              cx={x}
              cy={y}
              fill={handle === "center" ? PRIMARY_COLOR : "white"}
              r={5}
              stroke={PRIMARY_COLOR}
              strokeWidth={2}
            />
          ))}
        </>
      )}
    </g>
  );
});

export const CanvasContent = memo(function CanvasContent({
  canvasProps,
  selectedShapeId,
  shapeRefs,
}: CanvasContentProps) {
  return (
    <svg className={styles.canvas} {...canvasProps}>
      {shapeRefs.map(shapeRef => (
        <ShapeRenderer key={shapeRef.id} selectedShapeId={selectedShapeId} shapeRef={shapeRef} />
      ))}
    </svg>
  );
});
