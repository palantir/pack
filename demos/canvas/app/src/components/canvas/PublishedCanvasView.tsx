/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

import { Button, Callout, Spinner, Tag } from "@blueprintjs/core";
import type { DocumentModel, VersionedDocRef } from "@demo/canvas.sdk";
import { FreehandStrokeModel, NodeShapeModel } from "@demo/canvas.sdk";
import type {
  PublishedVersionDocumentRef,
  PublishedVersionRef,
} from "@palantir/pack.document-schema.model-types";
import type { UsePublishedVersionDocRefResult } from "@palantir/pack.state.react";
import { useDocMetadata, useRecords } from "@palantir/pack.state.react";
import { memo } from "react";
import type { CanvasContentProps } from "./CanvasContent.js";
import { CanvasContent } from "./CanvasContent.js";
import pageStyles from "./CanvasPage.module.css";
import toolbarStyles from "./CanvasToolbar.module.css";
import styles from "./PublishedCanvasView.module.css";
import { VersionsPanel } from "./VersionsPanel.js";

const NO_CANVAS_EVENTS: CanvasContentProps["canvasProps"] = {
  onMouseDown: () => {},
  onMouseMove: () => {},
  onMouseUp: () => {},
};
const NO_REMOTE_USERS: CanvasContentProps["remoteUsersByUserId"] = new Map();
const NO_SELECTIONS: CanvasContentProps["userIdsBySelectedNodeId"] = new Map();

export interface PublishedCanvasViewProps {
  readonly liveDraftRef: VersionedDocRef;
  readonly publishedVersionRef: PublishedVersionRef;
  readonly publishedVersionResult: UsePublishedVersionDocRefResult<DocumentModel>;
  onOpenVersion: (versionRef: PublishedVersionRef | undefined) => void;
}

export const PublishedCanvasView = memo(function PublishedCanvasView({
  liveDraftRef,
  publishedVersionRef,
  publishedVersionResult,
  onOpenVersion,
}: PublishedCanvasViewProps) {
  const { metadata } = useDocMetadata(liveDraftRef);
  const publishedVersion = publishedVersionResult.status === "loaded"
    ? publishedVersionResult.docRef.publishedVersion
    : undefined;

  return (
    <div className={pageStyles.container}>
      <div className={toolbarStyles.toolbar}>
        <div className={styles.documentName}>{metadata?.name ?? "Untitled"}</div>
        <Tag intent="primary" minimal={true} round={true}>
          {publishedVersion != null
            ? `Published: ${publishedVersion.name ?? "Untitled version"} · read-only`
            : "Published version · read-only"}
        </Tag>
        <div className={toolbarStyles.toolGroupRight}>
          <Button icon="edit" onClick={() => onOpenVersion(undefined)} text="Back to live draft" />
          <VersionsPanel
            docRef={liveDraftRef}
            onOpenVersion={onOpenVersion}
            openVersionRef={publishedVersionRef}
          />
        </div>
      </div>

      {publishedVersionResult.status === "loaded" && (
        <PublishedCanvas doc={publishedVersionResult.docRef} />
      )}
      {publishedVersionResult.status === "loading" && (
        <div className={styles.status}>
          <Spinner size={20} />
          Loading version…
        </div>
      )}
      {publishedVersionResult.status === "error" && (
        <div className={styles.status}>
          <Callout intent="danger" title="Couldn't open this version">
            {publishedVersionResult.error.message}
          </Callout>
        </div>
      )}
    </div>
  );
});

const PublishedCanvas = memo(function PublishedCanvas({
  doc,
}: {
  readonly doc: PublishedVersionDocumentRef<DocumentModel>;
}) {
  const shapeRefs = useRecords(doc, NodeShapeModel);
  const strokeRefs = useRecords(doc, FreehandStrokeModel);

  return (
    <CanvasContent
      canvasProps={NO_CANVAS_EVENTS}
      remoteUsersByUserId={NO_REMOTE_USERS}
      selectedShapeId={undefined}
      shapeRefs={shapeRefs}
      strokeRefs={strokeRefs}
      userIdsBySelectedNodeId={NO_SELECTIONS}
    />
  );
});
