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

import { Button, Callout, Dialog, DialogBody, DialogFooter } from "@blueprintjs/core";
import { DocumentModel } from "@demo/canvas.sdk";
import React, { useCallback, useState } from "react";
import { app } from "../../app.js";
import type { CanvasDocument } from "../../hooks/useCanvasDocuments.js";

interface DeleteCanvasDialogProps {
  readonly document: CanvasDocument | undefined;
  readonly setDocument: (doc: CanvasDocument | undefined) => void;
  readonly removeDocument: (id: CanvasDocument["id"]) => void;
}

export function DeleteCanvasDialog(
  { document, setDocument, removeDocument }: DeleteCanvasDialogProps,
) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setError(null);
    setDocument(undefined);
  }, [setDocument]);

  const confirmDelete = useCallback(async () => {
    if (document == null) return;

    setError(null);
    setDeleting(true);

    try {
      const docRef = app.state.createDocRef(document.id, DocumentModel);
      await app.state.deleteDocument(docRef);
      removeDocument(document.id);
      setDocument(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete document");
    } finally {
      setDeleting(false);
    }
  }, [document, removeDocument, setDocument]);

  return (
    <Dialog
      isOpen={document != null}
      onClose={closeDialog}
      title="Archive canvas"
    >
      <DialogBody>
        {error && (
          <Callout intent="danger" style={{ marginBottom: "15px" }}>
            {error}
          </Callout>
        )}
        <p>
          Are you sure you want to archive <strong>{document?.name}</strong>?
        </p>
        <Callout intent="warning">
          This will archive the document. It will no longer appear in search results.
        </Callout>
      </DialogBody>
      <DialogFooter
        actions={
          <React.Fragment>
            <Button
              text="Cancel"
              onClick={closeDialog}
              disabled={deleting}
            />
            <Button
              text="Archive"
              intent="danger"
              onClick={confirmDelete}
              disabled={deleting}
              loading={deleting}
            />
          </React.Fragment>
        }
      />
    </Dialog>
  );
}
