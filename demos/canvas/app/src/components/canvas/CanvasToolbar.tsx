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

import type { VersionedDocRef } from "@demo/canvas.sdk";
import { matchVersion, NodeShapeModel } from "@demo/canvas.sdk";
import { isDemoEnv } from "@palantir/pack.app";
import { generateId } from "@palantir/pack.core";
import type { RecordId } from "@palantir/pack.document-schema.model-types";
import { useDocMetadata } from "@palantir/pack.state.react";
import type { ChangeEvent } from "react";
import { memo, useState } from "react";
import type { ToolMode } from "../../hooks/useCanvasInteraction.js";
import { createLargePayloadTestShape } from "../../utils/createLargePayloadTestShape.js";
import { AVAILABLE_COLORS } from "../../utils/getDefaultColor.js";
import { ActivityPanel } from "./ActivityPanel.js";
import styles from "./CanvasToolbar.module.css";
import { EditCanvasDialog } from "./EditCanvasDialog.js";

export interface CanvasToolbarProps {
  readonly canDelete: boolean;
  readonly currentColor: string;
  readonly currentOpacity: number | undefined;
  readonly currentTool: ToolMode;
  readonly doc: VersionedDocRef;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onOpacityChange: (opacity: number) => void;
  onToolChange: (tool: ToolMode) => void;
}

export const CanvasToolbar = memo(function CanvasToolbar({
  canDelete,
  currentColor,
  currentOpacity,
  currentTool,
  doc,
  onColorChange,
  onDelete,
  onOpacityChange,
  onToolChange,
}: CanvasToolbarProps) {
  const { metadata } = useDocMetadata(doc);
  const [isCreatingLargePayload, setIsCreatingLargePayload] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [largePayloadDocumentId, setLargePayloadDocumentId] = useState<string>();
  const [largePayloadError, setLargePayloadError] = useState<string>();

  const handleColorChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onColorChange(e.target.value);
  };

  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onOpacityChange(Number(e.target.value));
  };

  const handleTestLargePayload = async (base64Characters: number) => {
    setIsCreatingLargePayload(true);
    setLargePayloadDocumentId(doc.id);
    setLargePayloadError(undefined);

    try {
      const id = `payload-test-${generateId()}` as RecordId;
      const shape = createLargePayloadTestShape(base64Characters);
      const shapeV2 = {
        ...shape,
        fillColor: "#dc3545",
        opacity: 1,
        strokeColor: "#dc3545",
      };

      await matchVersion(doc, {
        1: doc => doc.setRecord(NodeShapeModel, id, { ...shape, color: "#dc3545" }),
        2: doc => doc.setRecord(NodeShapeModel, id, shapeV2),
        3: doc => doc.setRecord(NodeShapeModel, id, shapeV2),
      });
    } catch (error) {
      setLargePayloadError(error instanceof Error ? error.message : "Failed to create test update");
    } finally {
      setIsCreatingLargePayload(false);
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.documentName} onClick={() => setIsEditDialogOpen(true)}>
        {metadata?.name ?? "Untitled"}
      </div>
      <EditCanvasDialog
        docRef={doc}
        isOpen={isEditDialogOpen}
        metadata={metadata}
        setIsOpen={setIsEditDialogOpen}
      />

      <div className={styles.toolGroup}>
        <button
          className={currentTool === "select" ? styles.activeButton : styles.button}
          onClick={() => onToolChange("select")}
          type="button"
        >
          Select
        </button>
        <button
          className={currentTool === "addBox" ? styles.activeButton : styles.button}
          onClick={() => onToolChange("addBox")}
          type="button"
        >
          Add Box
        </button>
        <button
          className={currentTool === "addCircle" ? styles.activeButton : styles.button}
          onClick={() => onToolChange("addCircle")}
          type="button"
        >
          Add Circle
        </button>
        {doc.version >= 3 && (
          <button
            className={currentTool === "pen" ? styles.activeButton : styles.button}
            onClick={() => onToolChange("pen")}
            type="button"
          >
            Pen
          </button>
        )}
      </div>

      <div className={styles.toolGroup}>
        <label className={styles.label}>
          {doc.version >= 2 ? "Fill/Stroke:" : "Color:"}
          <select className={styles.select} onChange={handleColorChange} value={currentColor}>
            {AVAILABLE_COLORS.map(color => (
              <option key={color} value={color}>
                {getColorName(color)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {doc.version >= 2 && currentOpacity != null && (
        <div className={styles.toolGroup}>
          <label className={styles.label}>
            Opacity:
            <input
              className={styles.slider}
              disabled={!canDelete}
              max={1}
              min={0.1}
              onChange={handleOpacityChange}
              step={0.05}
              type="range"
              value={currentOpacity}
            />
            <span className={styles.opacityValue}>{Math.round(currentOpacity * 100)}%</span>
          </label>
        </div>
      )}

      <div className={styles.toolGroup}>
        <button
          className={styles.button}
          disabled={!canDelete}
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
      </div>

      {import.meta.env.DEV && globalThis.location.hostname === "localhost" && !isDemoEnv() && (
        <div className={styles.toolGroup}>
          <button
            className={styles.button}
            disabled={metadata == null || isCreatingLargePayload}
            onClick={() =>
              handleTestLargePayload(512 * 1024)}
            title="Adds a box with a ~512 KiB update (under the limit). Use a disposable canvas."
            type="button"
          >
            Test ~512 KiB update
          </button>
          <button
            className={styles.button}
            disabled={metadata == null || isCreatingLargePayload}
            onClick={() => handleTestLargePayload(1024 * 1024)}
            title="Adds a box with a ~1 MiB update. Use a disposable canvas."
            type="button"
          >
            Test ~1 MiB update
          </button>
          {largePayloadDocumentId === doc.id && largePayloadError != null && (
            <span role="alert">{largePayloadError}</span>
          )}
        </div>
      )}

      <div className={styles.toolGroup}>
        <span style={{ fontSize: 12, color: "#8a9ba8" }}>v{doc.version}</span>
      </div>

      <div className={styles.toolGroupRight}>
        <ActivityPanel docRef={doc} />
      </div>
    </div>
  );
});

function getColorName(hex: string): string {
  const colorNames: Record<string, string> = {
    "#000000": "Black",
    "#0066cc": "Blue",
    "#28a745": "Green",
    "#dc3545": "Red",
    "#ffc107": "Yellow",
  };
  return colorNames[hex] ?? hex;
}
