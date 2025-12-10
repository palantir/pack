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

import type { NodeShape } from "@demo/canvas.sdk";
import type { MouseEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { boundsToCenter } from "../utils/boundsToCenter.js";
import { centerToBounds } from "../utils/centerToBounds.js";
import type { ResizeHandle } from "../utils/getResizeHandles.js";
import { getResizeHandles } from "../utils/getResizeHandles.js";
import { isPointInShape } from "../utils/isPointInShape.js";
import type { ShapeWithId } from "./useCanvasShapes.js";

export type DragMode = "move" | "resize";

export interface DragState {
  readonly dragMode: DragMode;
  readonly handle?: ResizeHandle;
  readonly shapeId: string;
  readonly startX: number;
  readonly startY: number;
}

export interface UseShapeDragResult {
  readonly canvasProps: {
    onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseUp: () => void;
  };
  readonly dragState: DragState | undefined;
  readonly isDragging: boolean;
}

const HANDLE_INTERACTION_RADIUS_PX = 10;

export function useShapeDrag(
  shapes: readonly ShapeWithId[],
  onUpdateShape: (id: string, updates: Partial<NodeShape>) => void,
  onShapeSelect: (id: string | undefined) => void,
  selectedShapeId: string | undefined,
): UseShapeDragResult {
  const [dragState, setDragState] = useState<DragState | undefined>();
  const initialShapeRef = useRef<ShapeWithId | undefined>(undefined);

  const findShapeAtPoint = useCallback(
    (x: number, y: number): ShapeWithId | undefined => {
      for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape != null && isPointInShape(x, y, shape)) {
          return shape;
        }
      }
      return undefined;
    },
    [shapes],
  );

  const findHandleAtPoint = useCallback(
    (x: number, y: number, shape: ShapeWithId): ResizeHandle | undefined => {
      const handles = getResizeHandles(shape);
      for (const { handle, x: hx, y: hy } of handles) {
        const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
        if (distance <= HANDLE_INTERACTION_RADIUS_PX) {
          return handle;
        }
      }
      return undefined;
    },
    [],
  );

  const onMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const selectedShape = selectedShapeId != null
        ? shapes.find(s => s.id === selectedShapeId)
        : undefined;

      if (selectedShape != null) {
        const handle = findHandleAtPoint(x, y, selectedShape);
        if (handle != null && handle !== "center") {
          initialShapeRef.current = selectedShape;
          setDragState({
            dragMode: "resize",
            handle,
            shapeId: selectedShape.id,
            startX: x,
            startY: y,
          });
          return;
        }
      }

      const shape = findShapeAtPoint(x, y);
      if (shape != null) {
        onShapeSelect(shape.id);
        initialShapeRef.current = shape;
        setDragState({
          dragMode: "move",
          shapeId: shape.id,
          startX: x,
          startY: y,
        });
      } else {
        onShapeSelect(undefined);
      }
    },
    [findHandleAtPoint, findShapeAtPoint, onShapeSelect, selectedShapeId, shapes],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (dragState == null || initialShapeRef.current == null) return;

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - dragState.startX;
      const dy = y - dragState.startY;

      if (dragState.dragMode === "move") {
        const initial = initialShapeRef.current;
        onUpdateShape(dragState.shapeId, {
          bottom: initial.bottom + dy,
          left: initial.left + dx,
          right: initial.right + dx,
          top: initial.top + dy,
        });
      } else if (dragState.dragMode === "resize" && dragState.handle != null) {
        const initial = initialShapeRef.current;
        const centerSize = boundsToCenter(initial);

        let newCenterX = centerSize.centerX;
        let newCenterY = centerSize.centerY;
        let newWidth = centerSize.width;
        let newHeight = centerSize.height;

        switch (dragState.handle) {
          case "nw":
            newWidth = centerSize.width - dx;
            newHeight = centerSize.height - dy;
            newCenterX = centerSize.centerX + dx / 2;
            newCenterY = centerSize.centerY + dy / 2;
            break;
          case "ne":
            newWidth = centerSize.width + dx;
            newHeight = centerSize.height - dy;
            newCenterX = centerSize.centerX + dx / 2;
            newCenterY = centerSize.centerY + dy / 2;
            break;
          case "sw":
            newWidth = centerSize.width - dx;
            newHeight = centerSize.height + dy;
            newCenterX = centerSize.centerX + dx / 2;
            newCenterY = centerSize.centerY + dy / 2;
            break;
          case "se":
            newWidth = centerSize.width + dx;
            newHeight = centerSize.height + dy;
            newCenterX = centerSize.centerX + dx / 2;
            newCenterY = centerSize.centerY + dy / 2;
            break;
        }

        newWidth = Math.max(20, newWidth);
        newHeight = Math.max(20, newHeight);

        const newBounds = centerToBounds({
          centerX: newCenterX,
          centerY: newCenterY,
          height: newHeight,
          width: newWidth,
        });

        onUpdateShape(dragState.shapeId, newBounds);
      }
    },
    [dragState, onUpdateShape],
  );

  const onMouseUp = useCallback(() => {
    setDragState(undefined);
    initialShapeRef.current = undefined;
  }, []);

  return {
    canvasProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
    },
    dragState,
    isDragging: dragState != null,
  };
}
