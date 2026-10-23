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

import type { KnownNodeShape, VersionedDocRef } from "@demo/canvas.sdk";
import { narrowKnownNodeShape, NodeShapeModel } from "@demo/canvas.sdk";
import type { RecordRef } from "@palantir/pack.document-schema.model-types";
import type { BBox } from "rbush";
import RBush from "rbush";
import { useCallback, useEffect, useRef } from "react";

interface ShapeIndexEntry {
  readonly recordRef: RecordRef<typeof NodeShapeModel>;
  readonly shape: KnownNodeShape;
}

export interface ShapeIndex {
  readonly findShapesAtPoint: (x: number, y: number) => RecordRef<typeof NodeShapeModel>[];
}

class RBushShapeIndex extends RBush<ShapeIndexEntry> {
  compareMinX(a: ShapeIndexEntry, b: ShapeIndexEntry): number {
    return a.shape.left - b.shape.left;
  }

  compareMinY(a: ShapeIndexEntry, b: ShapeIndexEntry): number {
    return a.shape.top - b.shape.top;
  }

  toBBox(item: ShapeIndexEntry): BBox {
    return {
      minX: item.shape.left,
      minY: item.shape.top,
      maxX: item.shape.right,
      maxY: item.shape.bottom,
    };
  }
}

function isIndexed(entry: ShapeIndexEntry | undefined): entry is ShapeIndexEntry {
  return entry != null;
}

export function useShapeIndex(doc: VersionedDocRef): ShapeIndex {
  const rbush = useRef<RBushShapeIndex | null>(null);
  const entryCache = useRef<Map<RecordRef<NodeShapeModel>, ShapeIndexEntry> | null>(null);

  if (rbush.current == null) {
    rbush.current = new RBushShapeIndex();
  }
  if (entryCache.current == null) {
    entryCache.current = new Map();
  }

  useEffect(() => {
    const shapeCollection = doc.getRecords(NodeShapeModel);

    // Shapes added by a newer version of the app aren't indexed, since this build can't draw them.
    const indexEntry = (
      recordRef: RecordRef<typeof NodeShapeModel>,
      shape: KnownNodeShape | undefined,
    ): ShapeIndexEntry | undefined => {
      if (shape == null) {
        entryCache.current?.delete(recordRef);
        return undefined;
      }
      const entry: ShapeIndexEntry = { shape, recordRef };
      entryCache.current?.set(recordRef, entry);
      return entry;
    };

    const indexShapes = (items: readonly RecordRef<typeof NodeShapeModel>[]) =>
      Promise.all(
        items.map(recordRef =>
          recordRef.getSnapshot().then(shape => indexEntry(recordRef, narrowKnownNodeShape(shape)))
        ),
      ).then(entries => rbush.current?.load(entries.filter(isIndexed)));

    const unsubscribeAdded = shapeCollection.onItemsAdded(indexShapes);
    // Also index existing shapes: reopening a loaded document fires no "added" events.
    void indexShapes([...shapeCollection]);

    const unsubscribeRemoved = shapeCollection.onItemsDeleted(items =>
      items.forEach(item => {
        const entry = entryCache.current?.get(item);
        if (entry != null) {
          rbush.current?.remove(entry);
          entryCache.current?.delete(item);
        }
      })
    );
    const unsubscribeChanged = shapeCollection.onItemsChanged(items => {
      const oldEntries = items.map(recordRef => entryCache.current?.get(recordRef));

      Promise.all(
        items.map(recordRef =>
          recordRef.getSnapshot().then(shape => indexEntry(recordRef, narrowKnownNodeShape(shape)))
        ),
      ).then(entries => {
        oldEntries.forEach(oldEntry => {
          if (oldEntry != null) {
            rbush.current?.remove(oldEntry);
          }
        });
        rbush.current?.load(entries.filter(isIndexed));
      });
    });

    return () => {
      rbush.current = null;
      entryCache.current = null;
      unsubscribeAdded();
      unsubscribeRemoved();
      unsubscribeChanged();
    };
  }, [doc]);

  const findShapesAtPoint = useCallback(
    (x: number, y: number): RecordRef<typeof NodeShapeModel>[] => {
      if (rbush.current == null) {
        return [];
      }
      const candidates = rbush.current.search({
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
      });
      return candidates.map(entry => entry.recordRef);
    },
    [],
  );

  return { findShapesAtPoint };
}
