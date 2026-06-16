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

import type { FreehandStrokeModel, NodeShapeModel, VersionedDocRef } from "@demo/canvas.sdk";
import { CanvasActivityModel, matchVersion } from "@demo/canvas.sdk";
import type { RecordRef } from "@palantir/pack.document-schema.model-types";
import type { MouseEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { getShapeUpdatedActivitySummary } from "../utils/activityMessages.js";
import { centerToBounds } from "../utils/centerToBounds.js";
import { getDefaultColor } from "../utils/getDefaultColor.js";
import { getDefaultShapeSize } from "../utils/getDefaultShapeSize.js";
import { toNodeShapeV1, toNodeShapeV2, toNodeShapeV3 } from "../utils/versionedShapes.js";
import { useCanvasShapes } from "./useCanvasShapes.js";
import { useFreehandStrokes } from "./useFreehandStrokes.js";
import { useShapeDrag } from "./useShapeDrag.js";
import { useShapeIndex } from "./useShapeIndex.js";
import { useShapeSelection } from "./useShapeSelection.js";

export type ToolMode = "select" | "addBox" | "addCircle" | "pen";

export interface UseCanvasInteractionResult {
  broadcastSelection: (nodeIds: readonly string[]) => void;
  readonly canvasProps: {
    onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
    onMouseUp: (e: MouseEvent<SVGSVGElement>) => void;
  };
  readonly currentColor: string;
  readonly currentOpacity: number | undefined;
  readonly currentTool: ToolMode;
  deleteSelected: () => void;
  readonly penPoints: readonly [number, number, number][] | undefined;
  readonly selectedShapeId: string | undefined;
  setColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setTool: (tool: ToolMode) => void;
  readonly shapeRefs: readonly RecordRef<typeof NodeShapeModel>[];
  readonly strokeRefs: readonly RecordRef<typeof FreehandStrokeModel>[];
}

export function useCanvasInteraction(
  doc: VersionedDocRef,
  broadcastSelection: (nodeIds: readonly string[]) => void,
): UseCanvasInteractionResult {
  const { addShape, shapeRefs } = useCanvasShapes(doc);
  const { addStroke, strokeRefs } = useFreehandStrokes(doc);
  const shapeIndex = useShapeIndex(doc);
  const { clearSelection, selectedShapeRef, selectShape } = useShapeSelection();
  const [currentTool, setCurrentTool] = useState<ToolMode>("select");
  const [currentColor, setCurrentColor] = useState<string>(getDefaultColor());
  const [currentOpacity, setCurrentOpacity] = useState<number | undefined>();

  const creationStateRef = useRef<{ startX: number; startY: number } | undefined>(undefined);
  const [penPoints, setPenPoints] = useState<[number, number, number][] | undefined>(undefined);

  const selectShapeWithBroadcast = useCallback(
    (ref: RecordRef<typeof NodeShapeModel> | undefined) => {
      selectShape(ref);
      broadcastSelection(ref != null ? [ref.id] : []);
      if (ref == null) {
        setCurrentOpacity(undefined);
        return;
      }
      setCurrentOpacity(undefined);
      void ref.getSnapshot().then(shape => {
        setCurrentOpacity(shape?.opacity);
      });
    },
    [broadcastSelection, selectShape],
  );

  const shapeDragHandlers = useShapeDrag(
    doc,
    shapeIndex,
    selectedShapeRef,
    selectShapeWithBroadcast,
  );

  const deleteSelected = useCallback(() => {
    if (selectedShapeRef != null) {
      const nodeId = selectedShapeRef.id;
      matchVersion(doc, {
        1: doc =>
          doc.withTransaction(
            () => {
              void doc.deleteRecord(selectedShapeRef);
            },
            doc.describeEdit(CanvasActivityModel, {
              activityType: "shapeDeleted",
              nodeId,
            }),
          ),
        2: doc =>
          doc.withTransaction(
            () => {
              void doc.deleteRecord(selectedShapeRef);
            },
            doc.describeEdit(CanvasActivityModel, {
              activityType: "shapeDeleted",
              nodeId,
            }),
          ),
        3: doc =>
          doc.withTransaction(
            () => {
              void doc.deleteRecord(selectedShapeRef);
            },
            doc.describeEdit(CanvasActivityModel, {
              activityType: "shapeDeleted",
              nodeId,
            }),
          ),
      });
      clearSelection();
      broadcastSelection([]);
      setCurrentOpacity(undefined);
    }
  }, [broadcastSelection, clearSelection, doc, selectedShapeRef]);

  const setColor = useCallback(
    async (color: string) => {
      setCurrentColor(color);
      if (selectedShapeRef != null) {
        const oldShape = await selectedShapeRef.getSnapshot();
        if (oldShape == null) return;

        matchVersion(doc, {
          1: doc => {
            const oldShapeV1 = toNodeShapeV1(oldShape);
            const newShapeV1 = { ...oldShapeV1, color };
            doc.withTransaction(
              () => {
                void doc.updateRecord(selectedShapeRef, { color });
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                nodeId: selectedShapeRef.id,
                oldShape: oldShapeV1,
                newShape: newShapeV1,
              }),
            );
          },
          2: doc => {
            const oldShapeV2 = toNodeShapeV2(oldShape);
            const newShapeV2 = toNodeShapeV2({
              ...oldShape,
              fillColor: color,
              strokeColor: color,
            });
            doc.withTransaction(
              () => {
                void doc.updateRecord(selectedShapeRef, {
                  fillColor: color,
                  strokeColor: color,
                });
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                nodeId: selectedShapeRef.id,
                oldShape: oldShapeV2,
                newShape: newShapeV2,
              }),
            );
          },
          3: doc => {
            const oldShapeV3 = toNodeShapeV3(oldShape);
            const newShapeV3 = toNodeShapeV3({
              ...oldShape,
              fillColor: color,
              strokeColor: color,
            });
            doc.withTransaction(
              () => {
                void doc.updateRecord(selectedShapeRef, {
                  fillColor: color,
                  strokeColor: color,
                });
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                nodeId: selectedShapeRef.id,
                oldShape: oldShapeV3,
                newShape: newShapeV3,
                summary: getShapeUpdatedActivitySummary(selectedShapeRef.id),
              }),
            );
          },
        });
      }
    },
    [doc, selectedShapeRef],
  );

  const setOpacity = useCallback(
    async (opacity: number) => {
      if (selectedShapeRef == null) {
        return;
      }

      const normalizedOpacity = normalizeOpacity(opacity);
      setCurrentOpacity(normalizedOpacity);

      const oldShape = await selectedShapeRef.getSnapshot();
      if (oldShape == null) return;

      matchVersion(doc, {
        1: () => {},
        2: doc => {
          const oldShapeV2 = toNodeShapeV2(oldShape);
          const newShapeV2 = toNodeShapeV2({ ...oldShape, opacity: normalizedOpacity });
          doc.withTransaction(
            () => {
              void doc.updateRecord(selectedShapeRef, { opacity: normalizedOpacity });
            },
            doc.describeEdit(CanvasActivityModel, {
              activityType: "shapeUpdated",
              nodeId: selectedShapeRef.id,
              oldShape: oldShapeV2,
              newShape: newShapeV2,
            }),
          );
        },
        3: doc => {
          const oldShapeV3 = toNodeShapeV3(oldShape);
          const newShapeV3 = toNodeShapeV3({ ...oldShape, opacity: normalizedOpacity });
          doc.withTransaction(
            () => {
              void doc.updateRecord(selectedShapeRef, { opacity: normalizedOpacity });
            },
            doc.describeEdit(CanvasActivityModel, {
              activityType: "shapeUpdated",
              nodeId: selectedShapeRef.id,
              oldShape: oldShapeV3,
              newShape: newShapeV3,
              summary: getShapeUpdatedActivitySummary(selectedShapeRef.id),
            }),
          );
        },
      });
    },
    [doc, selectedShapeRef],
  );

  const setTool = useCallback((tool: ToolMode) => {
    setCurrentTool(tool);
    creationStateRef.current = undefined;
    setPenPoints(undefined);
  }, []);

  const onMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        shapeDragHandlers.onMouseDown(e);
      } else if (currentTool === "pen") {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pressure = ("pressure" in e.nativeEvent)
          ? (e.nativeEvent as PointerEvent).pressure || 0.5
          : 0.5;
        setPenPoints([[x, y, pressure]]);
      } else {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        creationStateRef.current = { startX: x, startY: y };
      }
    },
    [currentTool, shapeDragHandlers],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        shapeDragHandlers.onMouseMove(e);
      } else if (currentTool === "pen") {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pressure = ("pressure" in e.nativeEvent)
          ? (e.nativeEvent as PointerEvent).pressure || 0.5
          : 0.5;
        setPenPoints(prev => prev == null ? prev : [...prev, [x, y, pressure]]);
      }
    },
    [currentTool, shapeDragHandlers],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (currentTool === "select") {
        shapeDragHandlers.onMouseUp();
        return;
      }

      if (currentTool === "pen") {
        if (penPoints != null && penPoints.length > 1) {
          addStroke(penPoints, currentColor);
        }
        setPenPoints(undefined);
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

        addShape(shapeType, bounds, currentColor).then(recordRef => {
          selectShapeWithBroadcast(recordRef);
        });

        creationStateRef.current = undefined;
        setCurrentTool("select");
      }
    },
    [
      addShape,
      addStroke,
      currentColor,
      currentTool,
      penPoints,
      selectShapeWithBroadcast,
      shapeDragHandlers,
    ],
  );

  return {
    broadcastSelection,
    canvasProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
    },
    currentColor,
    currentOpacity,
    currentTool,
    deleteSelected,
    penPoints,
    selectedShapeId: selectedShapeRef?.id,
    setColor,
    setOpacity,
    setTool,
    shapeRefs,
    strokeRefs,
  };
}

function normalizeOpacity(opacity: number): number {
  return Math.min(1, Math.max(0.1, Math.round(opacity * 100) / 100));
}
