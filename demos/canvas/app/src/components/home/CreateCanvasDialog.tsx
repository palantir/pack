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
  Radio,
  RadioGroup,
} from "@blueprintjs/core";
import { DocumentModel } from "@demo/canvas.sdk";
import { FileSystemType } from "@palantir/pack.state.core";
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { app, DOCUMENT_TYPE_NAME } from "../../app.js";

// TODO: Set your organization's classification (e.g. ["MU"])
const DEFAULT_CLASSIFICATION: readonly string[] = ["MU"];
// const DEFAULT_CLASSIFICATION: readonly string[] = ["MU"];

const DEFAULT_DOCUMENT_SECURITY = {
  discretionary: {},
  // discretionary: {
  //   owners: [{
  //     groupId: "d14d488c-5274-4cad-9c07-9d15172d62a9",
  //     type: "groupId" as const,
  //   }],
  // },
  mandatory: {
    classification: DEFAULT_CLASSIFICATION,
  },
};

interface CreateFileDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}
export function CreateFileDialog({ isOpen, setIsOpen }: CreateFileDialogProps) {
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fileSystemType, setFileSystemType] = useState<FileSystemType>(FileSystemType.ARTIFACTS);
  const [parentFolderRid, setParentFolderRid] = useState("");

  const navigate = useNavigate();

  const closeCreateDialog = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, [setIsOpen]);

  const createNew = useCallback(async () => {
    setError(null);

    if (DEFAULT_CLASSIFICATION.length === 0) {
      setError("DEFAULT_CLASSIFICATION is not configured.");
      return;
    }

    if (fileSystemType === FileSystemType.COMPASS && !parentFolderRid.trim()) {
      setError("Parent folder RID is required for Compass filesystem.");
      return;
    }

    setCreatingCanvas(true);

    try {
      const response = await app.state.createDocument({
        name,
        documentTypeName: DOCUMENT_TYPE_NAME,
        security: DEFAULT_DOCUMENT_SECURITY,
        parentFolderRid: fileSystemType === FileSystemType.COMPASS
          ? parentFolderRid.trim()
          : undefined,
      }, DocumentModel);
      navigate(`/canvas/${response.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create canvas");
    } finally {
      setCreatingCanvas(false);
    }
  }, [fileSystemType, name, navigate, parentFolderRid]);

  return (
    <Dialog isOpen={isOpen} onClose={closeCreateDialog} title="Create new file">
      <DialogBody>
        {error && (
          <Callout intent="danger" style={{ marginBottom: "15px" }}>
            {error}
          </Callout>
        )}
        <FormGroup label="Canvas name" labelFor="canvas-name">
          <InputGroup
            id="canvas-name"
            value={name}
            onValueChange={setName}
            autoFocus={true}
            placeholder="Enter name..."
          />
        </FormGroup>
        <FormGroup label="Storage type" labelFor="storage-type">
          <RadioGroup
            onChange={e => setFileSystemType(e.currentTarget.value as FileSystemType)}
            selectedValue={fileSystemType}
          >
            <Radio label="Artifacts (default)" value={FileSystemType.ARTIFACTS} />
            <Radio label="Compass" value={FileSystemType.COMPASS} />
          </RadioGroup>
        </FormGroup>
        {fileSystemType === FileSystemType.COMPASS && (
          <>
            <Callout intent="primary" style={{ marginBottom: "15px" }}>
              Compass manages discretionary security (owners, editors, viewers) through folder
              permissions. Leave discretionary security empty when creating Compass-backed
              documents.
            </Callout>
            <FormGroup
              label="Parent folder RID"
              labelFor="parent-folder-rid"
              helperText="The Compass folder RID where the document will be created (e.g., ri.compass.main.folder.xxx)"
            >
              <InputGroup
                id="parent-folder-rid"
                value={parentFolderRid}
                onValueChange={setParentFolderRid}
                placeholder="ri.compass.main.folder.xxx"
              />
            </FormGroup>
          </>
        )}
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
