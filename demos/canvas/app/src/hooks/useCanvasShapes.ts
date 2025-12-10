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
import { useCallback, useState } from "react";

export type ShapeWithId = NodeShape & {
  readonly id: string;
};

export interface UseCanvasShapesResult {
  readonly shapes: readonly ShapeWithId[];
  addShape: (shape: NodeShape) => string;
  deleteShape: (id: string) => void;
  updateShape: (id: string, updates: Partial<NodeShape>) => void;
}

export function useCanvasShapes(canvasId: string): UseCanvasShapesResult {
  // TODO: Replace with useRecords(docRef, NodeShapeModel)
  const [shapes, setShapes] = useState<Map<string, ShapeWithId>>(new Map());

  const addShape = useCallback(
    (shape: NodeShape): string => {
      const id = `shape-${Date.now()}-${Math.random()}`;
      const shapeWithId: ShapeWithId = { ...shape, id };

      // TODO: Replace with Pack mutation API to create record
      setShapes(prev => new Map(prev).set(id, shapeWithId));

      return id;
    },
    [],
  );

  const updateShape = useCallback((id: string, updates: Partial<NodeShape>) => {
    // TODO: Replace with Pack mutation API to update record
    setShapes(prev => {
      const shape = prev.get(id);
      if (shape == null) return prev;

      const updated: ShapeWithId = { ...shape, ...updates };
      return new Map(prev).set(id, updated);
    });
  }, []);

  const deleteShape = useCallback((id: string) => {
    // TODO: Replace with Pack mutation API to delete record
    setShapes(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return {
    addShape,
    deleteShape,
    shapes: Array.from(shapes.values()),
    updateShape,
  };
}
