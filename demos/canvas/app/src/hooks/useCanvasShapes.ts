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

import { ActivityEventModel, matchVersion, NodeShapeModel } from "@demo/canvas.sdk";
import type { VersionedDocRef } from "@demo/canvas.sdk";
import { generateId } from "@palantir/pack.core";
import type { RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";
import { ActivityEvents } from "@palantir/pack.document-schema.model-types";
import { isValidRecordRef } from "@palantir/pack.state.core";
import { useRecords } from "@palantir/pack.state.react";
import { useCallback } from "react";

export interface UseCanvasShapesResult {
  readonly addShape: (
    shapeType: "box" | "circle",
    bounds: { top: number; left: number; bottom: number; right: number },
    color: string,
  ) => Promise<RecordRef<typeof NodeShapeModel>>;
  readonly shapeRefs: readonly RecordRef<typeof NodeShapeModel>[];
}

export function useCanvasShapes(doc: VersionedDocRef): UseCanvasShapesResult {
  const shapeRefs = useRecords(doc, NodeShapeModel);

  const addShape = useCallback(
    async (
      shapeType: "box" | "circle",
      bounds: { top: number; left: number; bottom: number; right: number },
      color: string,
    ): Promise<RecordRef<typeof NodeShapeModel>> => {
      const id = `shape-${generateId()}` as RecordId;

      await doc.withTransaction(
        () => {
          matchVersion(doc, {
            1: doc =>
              doc.setCollectionRecord(NodeShapeModel, id, {
                ...bounds,
                color,
                shapeType,
              }),
            2: doc =>
              doc.setCollectionRecord(NodeShapeModel, id, {
                ...bounds,
                fillColor: color,
                strokeColor: color,
                opacity: 1.0,
                shapeType,
              }),
          });
        },
        ActivityEvents.describeEdit(ActivityEventModel, {
          eventType: "shapeAdd",
          nodeId: id,
        }),
      );

      const collection = doc.getRecords(NodeShapeModel);
      const recordRef = collection.get(id);
      if (recordRef == null || !isValidRecordRef(recordRef)) {
        throw new Error(`Failed to create shape with id: ${id}`);
      }
      return recordRef;
    },
    [doc],
  );

  return {
    addShape,
    shapeRefs,
  };
}
