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
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import { memo, useCallback, useState } from "react";
import { app } from "../../app.js";

export interface PublishVersionButtonProps {
  readonly liveDraftRef: DocumentRef;
}

export const PublishVersionButton = memo(function PublishVersionButton({
  liveDraftRef,
}: PublishVersionButtonProps) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [name, setName] = useState("");

  const handleOpen = useCallback(() => {
    setDescription("");
    setError(null);
    setName("");
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handlePublish = useCallback(async () => {
    setError(null);
    setIsPublishing(true);

    try {
      const trimmedDescription = description.trim();
      const trimmedName = name.trim();
      await app.state.createPublishedVersion(liveDraftRef, {
        ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
        ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
      });
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish version");
    } finally {
      setIsPublishing(false);
    }
  }, [description, liveDraftRef, name]);

  return (
    <>
      <Button intent="primary" onClick={handleOpen} text="Publish" />
      <Dialog isOpen={isOpen} onClose={handleClose} title="Publish version">
        <DialogBody>
          <p>
            Saves the canvas as it is now as a read-only version. You can keep editing the live
            draft.
          </p>
          {error != null && (
            <Callout intent="danger" style={{ marginBottom: "15px" }}>
              {error}
            </Callout>
          )}
          <FormGroup label="Name" labelFor="publish-version-name">
            <InputGroup
              autoFocus={true}
              id="publish-version-name"
              onValueChange={setName}
              placeholder="e.g. September release"
              value={name}
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="publish-version-description">
            <TextArea
              fill={true}
              id="publish-version-description"
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
              value={description}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button disabled={isPublishing} onClick={handleClose} text="Cancel" />
              <Button
                intent="primary"
                loading={isPublishing}
                onClick={handlePublish}
                text="Publish"
              />
            </>
          }
        />
      </Dialog>
    </>
  );
});
