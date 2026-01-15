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

import { Button, Dialog, DialogBody, DialogFooter, InputGroup } from "@blueprintjs/core";
import { DocumentModel } from "@demo/canvas.sdk";
import type { DocumentSecurity } from "@palantir/pack.document-schema.model-types";
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { app, DOCUMENT_TYPE_NAME } from "../../app.js";

// TODO: Set your organization's classification (e.g. ["MU"])
const DEFAULT_CLASSIFICATION: readonly string[] = [];

const DEFAULT_DOCUMENT_SECURITY: DocumentSecurity = Object.freeze({
  discretionary: {},
  mandatory: {
    classification: DEFAULT_CLASSIFICATION,
  },
});

interface CreateFileDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}
export function CreateFileDialog({ isOpen, setIsOpen }: CreateFileDialogProps) {
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [name, setName] = useState("");

  const navigate = useNavigate();

  const closeCreateDialog = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const createNew = useCallback(() => {
    async function createCanvas() {
      if (DEFAULT_CLASSIFICATION.length === 0) {
        throw new Error("DEFAULT_CLASSIFICATION is not configured.");
      }

      setCreatingCanvas(true);

      const response = await app.state.createDocument({
        name,
        documentTypeName: DOCUMENT_TYPE_NAME,
        security: DEFAULT_DOCUMENT_SECURITY,
      }, DocumentModel);
      navigate(`/canvas/${response.id}`);
    }
    createCanvas();
  }, [name]);

  return (
    <Dialog isOpen={isOpen} onClose={closeCreateDialog} title="Create new file">
      <DialogBody>
        <div style={{ marginBottom: "15px" }}>
          <div style={{ marginBottom: "5px" }}>Canvas name</div>
          <InputGroup
            value={name}
            onValueChange={setName}
            autoFocus={true}
            placeholder="Enter name..."
          />
        </div>
      </DialogBody>
      <DialogFooter
        actions={
          <React.Fragment>
            <Button
              text="Cancel"
              onClick={closeCreateDialog}
              disabled={creatingCanvas}
            />
            <Button
              text="Create"
              intent="primary"
              onClick={createNew}
              disabled={creatingCanvas}
              loading={creatingCanvas}
            />
          </React.Fragment>
        }
      />
    </Dialog>
  );
}
