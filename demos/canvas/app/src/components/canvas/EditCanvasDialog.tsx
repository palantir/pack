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

import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  InputGroup,
  TextArea,
} from "@blueprintjs/core";
import type { DocumentMetadata, DocumentRef } from "@palantir/pack.document-schema.model-types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { app } from "../../app.js";

interface EditCanvasDialogProps {
  readonly docRef: DocumentRef;
  readonly isOpen: boolean;
  readonly metadata: DocumentMetadata | undefined;
  readonly setIsOpen: (isOpen: boolean) => void;
}

export function EditCanvasDialog({ docRef, isOpen, metadata, setIsOpen }: EditCanvasDialogProps) {
  const [name, setName] = useState(metadata?.name ?? "");
  const [description, setDescription] = useState(metadata?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSnapshotRef = useRef<DocumentMetadata | undefined>(undefined);

  const hasRemoteChange = isOpen
    && !saving
    && openSnapshotRef.current != null
    && (metadata?.name !== openSnapshotRef.current.name
      || metadata?.description !== openSnapshotRef.current.description);

  const refreshFromRemote = useCallback(() => {
    openSnapshotRef.current = metadata;
    setName(metadata?.name ?? "");
    setDescription(metadata?.description ?? "");
  }, [metadata]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      openSnapshotRef.current = metadata;
      setName(metadata?.name ?? "");
      setDescription(metadata?.description ?? "");
      setError(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen, metadata]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, [setIsOpen]);

  const save = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        setError("Name is required");
        return;
      }
      const snapshot = openSnapshotRef.current;
      const update: { name?: string; description?: string } = {};
      if (trimmedName !== (snapshot?.name ?? "")) {
        update.name = trimmedName;
      }
      if (description !== (snapshot?.description ?? "")) {
        update.description = description;
      }
      await app.state.updateDocument(docRef, update);
      openSnapshotRef.current = undefined;
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update canvas");
    } finally {
      setSaving(false);
    }
  }, [docRef, name, description, setIsOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title="Edit canvas"
    >
      <DialogBody>
        {hasRemoteChange && (
          <Callout intent="warning" style={{ marginBottom: "15px" }}>
            This document was updated by another user. You are editing stale data.
            <Button
              variant="minimal"
              size="small"
              intent="warning"
              text="Refresh"
              onClick={refreshFromRemote}
              style={{ marginLeft: "8px" }}
            />
          </Callout>
        )}
        {error && (
          <Callout intent="danger" style={{ marginBottom: "15px" }}>
            {error}
          </Callout>
        )}
        <FormGroup label="Name" labelFor="edit-canvas-name">
          <InputGroup
            id="edit-canvas-name"
            value={name}
            onValueChange={setName}
            autoFocus={true}
            placeholder="Enter name..."
          />
        </FormGroup>
        <FormGroup label="Description" labelFor="edit-canvas-description">
          <TextArea
            id="edit-canvas-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Enter description..."
            fill={true}
            rows={3}
          />
        </FormGroup>
      </DialogBody>
      <DialogFooter
        actions={
          <React.Fragment>
            <Button
              text="Cancel"
              onClick={close}
              disabled={saving}
            />
            <Button
              text="Save"
              intent="primary"
              onClick={save}
              disabled={saving || name.trim().length === 0}
              loading={saving}
            />
          </React.Fragment>
        }
      />
    </Dialog>
  );
}
