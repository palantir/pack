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
import { Callout, OverlayToaster, Position } from "@blueprintjs/core";
import type { SupportedVersions, VersionedDocRef } from "@demo/canvas.sdk";
import type { DocumentId, PublishedVersionRef } from "@palantir/pack.document-schema.model-types";
import { isValidDocRef } from "@palantir/pack.state.core";
import { usePublishedVersionDocRef } from "@palantir/pack.state.react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { app } from "../../app.js";
import { useActivityToast } from "../../hooks/useActivityToast.js";
import { useBroadcastPresence } from "../../hooks/useBroadcastPresence.js";
import { useCanvasInteraction } from "../../hooks/useCanvasInteraction.js";
import { useRemotePresence } from "../../hooks/useRemotePresence.js";
import { useStatusErrorToast } from "../../hooks/useStatusErrorToast.js";
import { useCanvasDocRef } from "../../pack.js";
import { CanvasContent } from "./CanvasContent.js";
import styles from "./CanvasPage.module.css";
import { CanvasToolbar } from "./CanvasToolbar.js";
import { PublishedCanvasView } from "./PublishedCanvasView.js";

export const CanvasPage = () => {
  const { canvasId } = useParams<{ canvasId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const schemaOverride = searchParams.get("schema");
  const versionOverride = schemaOverride != null
    ? parseInt(schemaOverride, 10) as SupportedVersions
    : undefined;
  // The open published version lives in the URL, so it clears when you switch canvases.
  const publishedVersionRef: PublishedVersionRef | undefined = searchParams.get("version")
    ?? undefined;

  const { doc, persistedVersion } = useCanvasDocRef(
    app,
    canvasId as DocumentId | undefined,
    versionOverride,
  );
  const published = usePublishedVersionDocRef(app, doc, publishedVersionRef);
  const [toaster, setToaster] = useState<Toaster | null>(null);
  const [statusToaster, setStatusToaster] = useState<Toaster | null>(null);

  useEffect(() => {
    let mounted = true;

    OverlayToaster.create({
      position: Position.TOP_RIGHT,
    }).then(createdToaster => {
      if (mounted) {
        setToaster(createdToaster);
      }
    });

    OverlayToaster.create({
      position: Position.TOP,
    }).then(createdToaster => {
      if (mounted) {
        setStatusToaster(createdToaster);
      }
    });

    return () => {
      mounted = false;
      setToaster(prev => {
        prev?.clear();
        return null;
      });
      setStatusToaster(prev => {
        prev?.clear();
        return null;
      });
    };
  }, []);

  // Pass undefined to go back to the live draft.
  const openVersion = useCallback(
    (ref: PublishedVersionRef | undefined) => {
      if (ref === publishedVersionRef) {
        return;
      }
      setSearchParams(params => {
        const nextParams = new URLSearchParams(params);
        if (ref == null) {
          nextParams.delete("version");
        } else {
          nextParams.set("version", ref);
        }
        return nextParams;
      });
    },
    [publishedVersionRef, setSearchParams],
  );

  if (!isValidDocRef(doc)) {
    return <div>Canvas ID is required</div>;
  }

  if (versionOverride != null && versionOverride < persistedVersion) {
    return (
      <div className={styles.container} style={{ padding: 24 }}>
        <Callout intent="danger" title="Schema version incompatible">
          This document has been written at schema version {persistedVersion}. Opening at version
          {" "}
          {versionOverride} would lose data. Use <code>?schema={persistedVersion}</code> or higher.
        </Callout>
      </div>
    );
  }

  // Keyed views reset all editing and presence state when switching between versions.
  if (publishedVersionRef != null) {
    return (
      <PublishedCanvasView
        liveDraftDoc={doc}
        key={publishedVersionRef}
        onOpenVersion={openVersion}
        published={published}
        publishedVersionRef={publishedVersionRef}
      />
    );
  }

  return (
    <CanvasEditor
      doc={doc}
      key={doc.id}
      onOpenVersion={openVersion}
      statusToaster={statusToaster}
      toaster={toaster}
    />
  );
};

interface CanvasEditorProps {
  readonly doc: VersionedDocRef;
  readonly statusToaster: Toaster | null;
  readonly toaster: Toaster | null;
  onOpenVersion: (ref: PublishedVersionRef | undefined) => void;
}

function CanvasEditor({ doc, statusToaster, toaster, onOpenVersion }: CanvasEditorProps) {
  const { broadcastCursor, broadcastSelection } = useBroadcastPresence(doc);
  const { remoteUsersByUserId, userIdsBySelectedNodeId } = useRemotePresence(doc);
  const interaction = useCanvasInteraction(doc, broadcastSelection);
  useActivityToast(doc, toaster);
  useStatusErrorToast(app, doc, statusToaster);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle keys pressed on the canvas itself. Keys typed in dialogs (which render in
      // portals) still bubble up here.
      if (e.target !== e.currentTarget) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        interaction.deleteSelected();
      }
    },
    [interaction.deleteSelected],
  );

  const handleCanvasMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      broadcastCursor(x, y);
      interaction.canvasProps.onMouseMove(e);
    },
    [broadcastCursor, interaction.canvasProps],
  );

  return (
    <div className={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      <CanvasToolbar
        canDelete={interaction.selectedShapeId != null}
        currentColor={interaction.currentColor}
        currentOpacity={interaction.currentOpacity}
        currentTool={interaction.currentTool}
        doc={doc}
        onColorChange={interaction.setColor}
        onDelete={interaction.deleteSelected}
        onOpacityChange={interaction.setOpacity}
        onOpenVersion={onOpenVersion}
        onToolChange={interaction.setTool}
      />
      <CanvasContent
        canvasProps={{
          ...interaction.canvasProps,
          onMouseMove: handleCanvasMouseMove,
        }}
        penColor={interaction.currentTool === "pen" ? interaction.currentColor : undefined}
        penPoints={interaction.penPoints}
        remoteUsersByUserId={remoteUsersByUserId}
        selectedShapeId={interaction.selectedShapeId}
        shapeRefs={interaction.shapeRefs}
        strokeRefs={interaction.strokeRefs}
        userIdsBySelectedNodeId={userIdsBySelectedNodeId}
      />
    </div>
  );
}
