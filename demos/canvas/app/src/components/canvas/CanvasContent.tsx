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

import type { FreehandStrokeModel, KnownNodeShape, NodeShapeModel } from "@demo/canvas.sdk";
import { narrowKnownNodeShape } from "@demo/canvas.sdk";
import type { RecordRef, UserId } from "@palantir/pack.document-schema.model-types";
import { useRecord } from "@palantir/pack.state.react";
import type { MouseEvent } from "react";
import { memo, useMemo } from "react";
import { getUserColor } from "../../hooks/useRemotePresence.js";
import { boundsToCenter } from "../../utils/boundsToCenter.js";
import { getResizeHandles } from "../../utils/getResizeHandles.js";
import styles from "./CanvasContent.module.css";
import { FreehandStrokeRenderer, PenPreview } from "./FreehandStrokeRenderer.js";
import { RemoteCursor } from "./RemoteCursor.js";

const PRIMARY_COLOR = "#0066cc";
const DEFAULT_SHAPE_COLOR = "#000000";
const LABEL_COLOR = "#1c2127";
const TITLE_COLOR = "#5f6b7c";

interface UserPresence {
  readonly cursor?: { readonly x: number; readonly y: number };
}

export interface CanvasContentProps {
  readonly canvasProps: {
    onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseUp: (e: MouseEvent<SVGSVGElement>) => void;
  };
  readonly penColor?: string;
  readonly penPoints?: readonly [number, number, number][];
  readonly remoteUsersByUserId: ReadonlyMap<UserId, UserPresence>;
  readonly selectedShapeId: string | undefined;
  readonly shapeRefs: readonly RecordRef<typeof NodeShapeModel>[];
  readonly strokeRefs: readonly RecordRef<typeof FreehandStrokeModel>[];
  readonly userIdsBySelectedNodeId: ReadonlyMap<string, ReadonlySet<UserId>>;
}

const ShapeRenderer = memo(function ShapeRenderer({
  selectedShapeId,
  shapeRef,
  userIdsBySelectedNodeId,
}: {
  selectedShapeId: string | undefined;
  shapeRef: RecordRef<typeof NodeShapeModel>;
  userIdsBySelectedNodeId: ReadonlyMap<string, ReadonlySet<UserId>>;
}) {
  const shape = narrowKnownNodeShape(useRecord(shapeRef).data);
  if (shape == null) return null;

  return (
    <ConnectedShapeRenderer
      selectedShapeId={selectedShapeId}
      shapeRef={shapeRef}
      userIdsBySelectedNodeId={userIdsBySelectedNodeId}
      shape={shape}
    />
  );
});

const ConnectedShapeRenderer = memo(function ShapeRenderer({
  selectedShapeId,
  shapeRef,
  userIdsBySelectedNodeId,
  shape,
}: {
  selectedShapeId: string | undefined;
  shapeRef: RecordRef<typeof NodeShapeModel>;
  userIdsBySelectedNodeId: ReadonlyMap<string, ReadonlySet<UserId>>;
  shape: KnownNodeShape;
}) {
  const isSelected = shapeRef.id === selectedShapeId;

  // fillColor/strokeColor are optional in v2 — default when absent.
  // For migrated v1 records, the lens derives them from `color`.
  const fill = shape.fillColor ?? DEFAULT_SHAPE_COLOR;
  const strokeColor = shape.strokeColor ?? DEFAULT_SHAPE_COLOR;
  const { opacity } = shape;
  const svgFill = `${fill}4D`;

  const remoteSelectingUserIds = useMemo(
    () => userIdsBySelectedNodeId.get(shapeRef.id) ?? new Set<UserId>(),
    [shapeRef.id, userIdsBySelectedNodeId],
  );

  const remoteSelectingUserIdsArray = useMemo(
    () => Array.from(remoteSelectingUserIds),
    [remoteSelectingUserIds],
  );

  if (shape.shapeType === "box") {
    return (
      <g key={shapeRef.id} opacity={opacity}>
        <rect
          fill={svgFill}
          height={shape.bottom - shape.top}
          stroke={strokeColor}
          strokeWidth={2}
          width={shape.right - shape.left}
          x={shape.left}
          y={shape.top}
        />
        <ShapeLabel
          label={shape.label}
          x={(shape.left + shape.right) / 2}
          y={(shape.top + shape.bottom) / 2}
        />
        <ShapeTitle shape={shape} />
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
        {remoteSelectingUserIdsArray.map((userId, index) => (
          <circle
            key={userId}
            cx={shape.right - 6}
            cy={shape.bottom - 6 - index * 10}
            fill={getUserColor(userId)}
            r={4}
            stroke="white"
            strokeWidth={1}
          />
        ))}
      </g>
    );
  }

  const { centerX, centerY, height, width } = boundsToCenter(shape);
  const rx = width / 2;
  const ry = height / 2;

  return (
    <g key={shapeRef.id} opacity={opacity}>
      <ellipse
        cx={centerX}
        cy={centerY}
        fill={svgFill}
        rx={rx}
        ry={ry}
        stroke={strokeColor}
        strokeWidth={2}
      />
      <ShapeLabel label={shape.label} x={centerX} y={centerY} />
      <ShapeTitle shape={shape} />
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
      {remoteSelectingUserIdsArray.map((userId, index) => (
        <circle
          key={userId}
          cx={shape.right - 6}
          cy={shape.bottom - 6 - index * 10}
          fill={getUserColor(userId)}
          r={4}
          stroke="white"
          strokeWidth={1}
        />
      ))}
    </g>
  );
});

// `label` was added in schema 3.1, so shapes from older apps have none.
function ShapeLabel({ label, x, y }: { label: string | undefined; x: number; y: number }) {
  if (label == null || label.length === 0) return null;

  return (
    <text
      dominantBaseline="central"
      fill={LABEL_COLOR}
      fontSize={14}
      pointerEvents="none"
      textAnchor="middle"
      x={x}
      y={y}
    >
      {label}
    </text>
  );
}

// `title` was added in schema 3.2. Shapes from older apps get the upgrade function's default.
function ShapeTitle({ shape }: { shape: KnownNodeShape }) {
  return (
    <text fill={TITLE_COLOR} fontSize={12} pointerEvents="none" x={shape.left} y={shape.top - 6}>
      {shape.title}
    </text>
  );
}

export const CanvasContent = memo(function CanvasContent({
  canvasProps,
  penColor,
  penPoints,
  remoteUsersByUserId,
  selectedShapeId,
  shapeRefs,
  strokeRefs,
  userIdsBySelectedNodeId,
}: CanvasContentProps) {
  return (
    <svg className={styles.canvas} {...canvasProps}>
      {strokeRefs.map(strokeRef => (
        <FreehandStrokeRenderer key={strokeRef.id} strokeRef={strokeRef} />
      ))}
      {shapeRefs.map(shapeRef => (
        <ShapeRenderer
          key={shapeRef.id}
          selectedShapeId={selectedShapeId}
          shapeRef={shapeRef}
          userIdsBySelectedNodeId={userIdsBySelectedNodeId}
        />
      ))}
      {penPoints != null && penColor != null && <PenPreview color={penColor} points={penPoints} />}
      {Array.from(remoteUsersByUserId.entries()).map(([userId, presence]) => {
        if (presence.cursor == null) return null;
        return (
          <RemoteCursor
            key={userId}
            color={getUserColor(userId)}
            label={userId.substring(0, 2)}
            x={presence.cursor.x}
            y={presence.cursor.y}
          />
        );
      })}
    </svg>
  );
});
