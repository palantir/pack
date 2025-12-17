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

import type { Toaster } from "@blueprintjs/core";
import { OverlayToaster, Position } from "@blueprintjs/core";
import { DocumentModel } from "@demo/canvas.sdk";
import { isValidDocRef } from "@palantir/pack.state.core";
import { useDocRef } from "@palantir/pack.state.react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router";
import { app } from "../../app.js";
import { useActivityToast } from "../../hooks/useActivityToast.js";
import { useCanvasInteraction } from "../../hooks/useCanvasInteraction.js";
import { CanvasContent } from "./CanvasContent.js";
import styles from "./CanvasPage.module.css";
import { CanvasToolbar } from "./CanvasToolbar.js";

export const CanvasPage = () => {
  const { canvasId } = useParams<{ canvasId: string }>();
  const docRef = useDocRef(app, DocumentModel, canvasId);
  const toasterRef = useRef<Toaster | null>(null);

  useEffect(() => {
    OverlayToaster.create({
      position: Position.TOP_RIGHT,
    }).then(toaster => {
      toasterRef.current = toaster;
    });

    return () => {
      toasterRef.current?.clear();
    };
  }, []);

  if (!isValidDocRef(docRef)) {
    return <div>Canvas ID is required</div>;
  }

  const interaction = useCanvasInteraction(docRef);
  useActivityToast(docRef, toasterRef);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        interaction.deleteSelected();
      }
    },
    [interaction.deleteSelected],
  );

  return (
    <div className={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      <CanvasToolbar
        canDelete={interaction.selectedShapeId != null}
        currentColor={interaction.currentColor}
        currentTool={interaction.currentTool}
        onColorChange={interaction.setColor}
        onDelete={interaction.deleteSelected}
        onToolChange={interaction.setTool}
      />
      <CanvasContent
        canvasProps={interaction.canvasProps}
        selectedShapeId={interaction.selectedShapeId}
        shapeRefs={interaction.shapeRefs}
      />
    </div>
  );
};
