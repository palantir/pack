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

import type { FreehandStrokeModel } from "@demo/canvas.sdk";
import type { RecordRef } from "@palantir/pack.document-schema.model-types";
import { useRecord } from "@palantir/pack.state.react";
import { getStroke } from "perfect-freehand";
import { memo } from "react";
import { getSvgPathFromStroke } from "../../utils/getSvgPathFromStroke.js";

const DEFAULT_COLOR = "#000000";

const STROKE_OPTIONS = {
  size: 6,
  smoothing: 0.5,
  thinning: 0.5,
  streamline: 0.5,
};

export interface FreehandStrokeRendererProps {
  readonly strokeRef: RecordRef<typeof FreehandStrokeModel>;
}

export const FreehandStrokeRenderer = memo(function FreehandStrokeRenderer({
  strokeRef,
}: FreehandStrokeRendererProps) {
  const record = useRecord(strokeRef);

  if (record.status !== "loaded") return null;

  const points: number[][] = JSON.parse(record.data.points);
  const outline = getStroke(points, STROKE_OPTIONS);
  const pathData = getSvgPathFromStroke(outline);

  return (
    <path
      d={pathData}
      fill={record.data.color ?? DEFAULT_COLOR}
    />
  );
});

export interface PenPreviewProps {
  readonly color: string;
  readonly points: readonly [number, number, number][];
}

export const PenPreview = memo(function PenPreview({ color, points }: PenPreviewProps) {
  if (points.length < 2) return null;

  const outline = getStroke([...points] as number[][], STROKE_OPTIONS);
  const pathData = getSvgPathFromStroke(outline);

  return (
    <path
      d={pathData}
      fill={color}
      opacity={0.5}
    />
  );
});
