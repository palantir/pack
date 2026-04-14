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

import { FreehandStrokeModel, matchVersion } from "@demo/canvas.sdk";
import type { VersionedDocRef } from "@demo/canvas.sdk";
import { generateId } from "@palantir/pack.core";
import type { RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";
import { useRecords } from "@palantir/pack.state.react";
import { useCallback } from "react";

export interface UseFreehandStrokesResult {
  readonly addStroke: (points: readonly [number, number, number][], color: string) => void;
  readonly strokeRefs: readonly RecordRef<typeof FreehandStrokeModel>[];
}

export function useFreehandStrokes(doc: VersionedDocRef): UseFreehandStrokesResult {
  const strokeRefs = useRecords(doc, FreehandStrokeModel);

  const addStroke = useCallback(
    (points: readonly [number, number, number][], color: string) => {
      const id = `stroke-${generateId()}` as RecordId;

      doc.withTransaction(() => {
        matchVersion(doc, {
          1: () => { /* FreehandStroke does not exist in v1 */ },
          2: () => { /* FreehandStroke does not exist in v2 */ },
          3: (doc) => doc.setCollectionRecord(FreehandStrokeModel, id, {
            points: JSON.stringify(points),
            color,
          }),
        });
      });
    },
    [doc],
  );

  return { addStroke, strokeRefs };
}
