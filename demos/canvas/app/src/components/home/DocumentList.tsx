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

import { Button } from "@blueprintjs/core";
import React, { useCallback } from "react";
import { Link } from "react-router";
import type { CanvasDocument } from "../../hooks/useCanvasDocuments.js";
import css from "./HomePage.module.css";

interface DocumentListProps {
  readonly documents: readonly CanvasDocument[];
  readonly error: Error | undefined;
  readonly onDeleteDocument: (doc: CanvasDocument) => void;
}

export const DocumentList = React.memo(
  function DocumentList({ documents, error, onDeleteDocument }: DocumentListProps) {
    if (error != null) {
      return (
        <div className={css.emptyList}>
          <p className={css.error}>Failed to load canvases!</p>
        </div>
      );
    }

    if (documents.length === 0) {
      return (
        <div className={css.emptyList}>
          <p>No canvases yet. Create one to get started!</p>
        </div>
      );
    }

    return (
      <div className={css.listItems}>
        {documents.map(doc => (
          <DocumentListItem
            key={doc.id}
            document={doc}
            onDelete={onDeleteDocument}
          />
        ))}
      </div>
    );
  },
);

interface DocumentListItemProps {
  readonly document: CanvasDocument;
  readonly onDelete: (doc: CanvasDocument) => void;
}

const DocumentListItem = React.memo(function DocumentListItem({
  document,
  onDelete,
}: DocumentListItemProps) {
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(document);
    },
    [document, onDelete],
  );

  return (
    <div className={css.listItem}>
      <Link
        className={css.canvasLink}
        to={`/canvas/${document.id}`}
      >
        {document.name}
      </Link>
      <Button
        icon="trash"
        variant="minimal"
        intent="danger"
        onClick={handleDelete}
        aria-label={`Delete ${document.name}`}
      />
    </div>
  );
});
