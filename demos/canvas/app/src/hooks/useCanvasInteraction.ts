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
import { centerToBounds } from "../utils/centerToBounds.js";
import { getDefaultColor } from "../utils/getDefaultColor.js";
import { getDefaultShapeSize } from "../utils/getDefaultShapeSize.js";
import type { ShapeWithId } from "./useCanvasShapes.js";
import { useCanvasShapes } from "./useCanvasShapes.js";
import { useShapeDrag } from "./useShapeDrag.js";
import { useShapeSelection } from "./useShapeSelection.js";

export type ToolMode = "select" | "addBox" | "addCircle";

export interface UseCanvasInteractionResult {
  readonly canvasProps: {
    onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseUp: (e: MouseEvent<SVGSVGElement>) => void;
  };
  readonly currentColor: string;
  readonly currentTool: ToolMode;
  deleteSelected: () => void;
  readonly selectedShapeId: string | undefined;
  setColor: (color: string) => void;
  setTool: (tool: ToolMode) => void;
  readonly shapes: readonly ShapeWithId[];
}

export function useCanvasInteraction(canvasId: string): UseCanvasInteractionResult {
  const { addShape, deleteShape, shapes, updateShape } = useCanvasShapes(canvasId);
  const { clearSelection, selectedShapeId, selectShape } = useShapeSelection();
  const [currentTool, setCurrentTool] = useState<ToolMode>("select");
  const [currentColor, setCurrentColor] = useState<string>(getDefaultColor());

  const creationStateRef = useRef<{ startX: number; startY: number } | undefined>(undefined);

  const dragHook = useShapeDrag(shapes, updateShape, selectShape, selectedShapeId);

  const deleteSelected = useCallback(() => {
    if (selectedShapeId != null) {
      deleteShape(selectedShapeId);
      clearSelection();
    }
  }, [clearSelection, deleteShape, selectedShapeId]);

  const setColor = useCallback(
    (color: string) => {
      setCurrentColor(color);
      if (selectedShapeId != null) {
        updateShape(selectedShapeId, { color });
      }
    },
    [selectedShapeId, updateShape],
  );

  const setTool = useCallback((tool: ToolMode) => {
    setCurrentTool(tool);
    creationStateRef.current = undefined;
  }, []);

  const onMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        dragHook.canvasProps.onMouseDown(e);
      } else {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        creationStateRef.current = { startX: x, startY: y };
      }
    },
    [currentTool, dragHook.canvasProps],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        dragHook.canvasProps.onMouseMove(e);
      }
    },
    [currentTool, dragHook.canvasProps],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        dragHook.canvasProps.onMouseUp();
        return;
      }

      if (creationStateRef.current != null) {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const { startX, startY } = creationStateRef.current;

        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        const defaultSize = getDefaultShapeSize();
        const finalWidth = width > 5 ? width : defaultSize.width;
        const finalHeight = height > 5 ? height : defaultSize.height;

        const centerX = width > 5 ? (startX + endX) / 2 : startX;
        const centerY = height > 5 ? (startY + endY) / 2 : startY;

        const bounds = centerToBounds({
          centerX,
          centerY,
          height: finalHeight,
          width: finalWidth,
        });

        const shapeType = currentTool === "addBox" ? "box" : "circle";
        const newShape: NodeShape = {
          ...bounds,
          color: currentColor,
          shapeType,
        };

        const newId = addShape(newShape);
        selectShape(newId);

        creationStateRef.current = undefined;
        setCurrentTool("select");
      }
    },
    [addShape, currentColor, currentTool, dragHook.canvasProps, selectShape],
  );

  return {
    canvasProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
    },
    currentColor,
    currentTool,
    deleteSelected,
    selectedShapeId,
    setColor,
    setTool,
    shapes,
  };
}
