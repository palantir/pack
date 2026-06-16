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

import type { NodeShape, NodeShapeModel, VersionedDocRef } from "@demo/canvas.sdk";
import { CanvasActivityModel, matchVersion } from "@demo/canvas.sdk";
import type { RecordRef } from "@palantir/pack.document-schema.model-types";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getShapeUpdatedActivitySummary } from "../utils/activityMessages.js";
import { boundsToCenter } from "../utils/boundsToCenter.js";
import { centerToBounds } from "../utils/centerToBounds.js";
import type { ResizeHandle } from "../utils/getResizeHandles.js";
import { getResizeHandles } from "../utils/getResizeHandles.js";
import { toNodeShapeV1, toNodeShapeV2, toNodeShapeV3 } from "../utils/versionedShapes.js";
import type { ShapeIndex } from "./useShapeIndex.js";

type DragMode = "move" | "resize";

interface DragState {
  readonly dragMode: DragMode;
  readonly handle?: ResizeHandle;
  readonly initialShape: NodeShape;
  readonly shapeRef: RecordRef<typeof NodeShapeModel>;
  readonly startX: number;
  readonly startY: number;
}

interface UseShapeDragResult {
  onMouseDown: (e: MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (e: MouseEvent<SVGSVGElement>) => void;
  onMouseUp: () => void;
}

const HANDLE_INTERACTION_RADIUS_PX = 10;

const DRAG_UPDATE_INTERVAL_MS = 1000 / 60;

export function useShapeDrag(
  doc: VersionedDocRef,
  shapeIndex: ShapeIndex,
  selectedShapeRef: RecordRef<typeof NodeShapeModel> | undefined,
  onShapeSelect: (ref: RecordRef<typeof NodeShapeModel> | undefined) => void,
): UseShapeDragResult {
  const [dragState, setDragState] = useState<DragState | undefined>();

  // Throttling state for drag updates. `lastUpdateTime` gates the 60fps interval;
  // `pendingBounds`/`pendingTimer` hold the trailing update so the final position is
  // never dropped when moves arrive faster than the interval.
  const lastUpdateTime = useRef(0);
  const pendingBounds = useRef<
    { bottom: number; left: number; right: number; top: number } | undefined
  >(undefined);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (pendingTimer.current != null) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = undefined;
      }
      pendingBounds.current = undefined;
    },
    [],
  );

  const applyBounds = useCallback(
    (
      shapeRef: RecordRef<typeof NodeShapeModel>,
      bounds: { bottom: number; left: number; right: number; top: number },
    ) => {
      matchVersion(doc, {
        1: doc => doc.updateRecord(shapeRef, bounds),
        2: doc => doc.updateRecord(shapeRef, bounds),
        3: doc => doc.updateRecord(shapeRef, bounds),
      });
    },
    [doc],
  );

  // Coalesces intermediate moves and schedules a trailing update
  // so the latest position lands even if it was throttled.
  const throttledApplyBounds = useCallback(
    (
      shapeRef: RecordRef<typeof NodeShapeModel>,
      bounds: { bottom: number; left: number; right: number; top: number },
    ) => {
      const now = Date.now();
      const elapsed = now - lastUpdateTime.current;

      if (elapsed >= DRAG_UPDATE_INTERVAL_MS) {
        lastUpdateTime.current = now;
        pendingBounds.current = undefined;
        applyBounds(shapeRef, bounds);
        return;
      }

      pendingBounds.current = bounds;
      if (pendingTimer.current == null) {
        pendingTimer.current = setTimeout(() => {
          pendingTimer.current = undefined;
          const latest = pendingBounds.current;
          pendingBounds.current = undefined;
          if (latest != null) {
            lastUpdateTime.current = Date.now();
            applyBounds(shapeRef, latest);
          }
        }, DRAG_UPDATE_INTERVAL_MS - elapsed);
      }
    },
    [applyBounds],
  );

  const onMouseDown = useCallback(
    async (e: MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (selectedShapeRef != null) {
        const selectedShape = await selectedShapeRef.getSnapshot();
        if (selectedShape == null) {
          return;
        }

        const handle = findHandleAtPoint(x, y, selectedShape);
        if (handle != null && handle !== "center") {
          setDragState({
            dragMode: "resize",
            handle,
            initialShape: selectedShape,
            shapeRef: selectedShapeRef,
            startX: x,
            startY: y,
          });
          return;
        }
      }

      const shapeRef = shapeIndex.findShapesAtPoint(x, y)[0];
      if (shapeRef == null) {
        onShapeSelect(undefined);
        return;
      }

      const shape = await shapeRef.getSnapshot();
      if (shape == null) return;

      onShapeSelect(shapeRef);
      setDragState({
        dragMode: "move",
        initialShape: shape,
        shapeRef,
        startX: x,
        startY: y,
      });
    },
    [onShapeSelect, selectedShapeRef, shapeIndex],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (dragState == null) return;

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - dragState.startX;
      const dy = y - dragState.startY;

      if (dragState.dragMode === "move") {
        const initial = dragState.initialShape;
        const newBounds = {
          bottom: initial.bottom + dy,
          left: initial.left + dx,
          right: initial.right + dx,
          top: initial.top + dy,
        };
        throttledApplyBounds(dragState.shapeRef, newBounds);
      } else if (dragState.dragMode === "resize" && dragState.handle != null) {
        const initial = dragState.initialShape;
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

        throttledApplyBounds(dragState.shapeRef, newBounds);
      }
    },
    [dragState, throttledApplyBounds],
  );

  const onMouseUp = useCallback(async () => {
    if (dragState == null) {
      return;
    }

    // Flush any trailing throttled update so the final position is committed
    // before we read the snapshot below.
    if (pendingTimer.current != null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = undefined;
    }
    if (pendingBounds.current != null) {
      const latest = pendingBounds.current;
      pendingBounds.current = undefined;
      applyBounds(dragState.shapeRef, latest);
    }
    lastUpdateTime.current = 0;

    const finalShape = await dragState.shapeRef.getSnapshot();
    if (finalShape != null) {
      const initial = dragState.initialShape;

      const wasModified = finalShape.left !== initial.left
        || finalShape.top !== initial.top
        || finalShape.right !== initial.right
        || finalShape.bottom !== initial.bottom;

      if (wasModified) {
        const finalBounds = {
          bottom: finalShape.bottom,
          left: finalShape.left,
          right: finalShape.right,
          top: finalShape.top,
        };
        matchVersion(doc, {
          1: doc => {
            const oldShape = toNodeShapeV1(dragState.initialShape);
            const newShape = toNodeShapeV1(finalShape);
            doc.withTransaction(
              () => {
                void doc.updateRecord(dragState.shapeRef, finalBounds);
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                newShape,
                nodeId: dragState.shapeRef.id,
                oldShape,
              }),
            );
          },
          2: doc => {
            const oldShape = toNodeShapeV2(dragState.initialShape);
            const newShape = toNodeShapeV2(finalShape);
            doc.withTransaction(
              () => {
                void doc.updateRecord(dragState.shapeRef, finalBounds);
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                newShape,
                nodeId: dragState.shapeRef.id,
                oldShape,
              }),
            );
          },
          3: doc => {
            const oldShape = toNodeShapeV3(dragState.initialShape);
            const newShape = toNodeShapeV3(finalShape);
            doc.withTransaction(
              () => {
                void doc.updateRecord(dragState.shapeRef, finalBounds);
              },
              doc.describeEdit(CanvasActivityModel, {
                activityType: "shapeUpdated",
                newShape,
                nodeId: dragState.shapeRef.id,
                oldShape,
                summary: getShapeUpdatedActivitySummary(dragState.shapeRef.id),
              }),
            );
          },
        });
      }
    }

    setDragState(undefined);
  }, [applyBounds, doc, dragState]);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}

function findHandleAtPoint(x: number, y: number, shape: NodeShape): ResizeHandle | undefined {
  const handles = getResizeHandles(shape);
  for (const { handle, x: hx, y: hy } of handles) {
    const distance = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
    if (distance <= HANDLE_INTERACTION_RADIUS_PX) {
      return handle;
    }
  }
  return undefined;
}
