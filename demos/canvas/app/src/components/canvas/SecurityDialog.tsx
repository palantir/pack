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
} from "@blueprintjs/core";
import type {
  DiscretionaryPrincipal,
  DocumentMetadata,
  DocumentRef,
  DocumentSecurity,
} from "@palantir/pack.document-schema.model-types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { app } from "../../app.js";

function principalsToUserIds(principals: readonly DiscretionaryPrincipal[] | undefined): string {
  if (principals == null) return "";
  return principals
    .filter((p): p is DiscretionaryPrincipal & { type: "userId" } => p.type === "userId")
    .map(p => p.userId)
    .join(", ");
}

function userIdsToPrincipals(input: string): DiscretionaryPrincipal[] {
  return input
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(userId => ({ type: "userId" as const, userId }));
}

function csvToList(input: string): string[] {
  return input.split(",").map(s => s.trim()).filter(s => s.length > 0);
}

function listToCsv(items: readonly string[] | undefined): string {
  return items?.join(", ") ?? "";
}

interface SecurityDialogProps {
  readonly docRef: DocumentRef;
  readonly isOpen: boolean;
  readonly metadata: DocumentMetadata | undefined;
  readonly setIsOpen: (isOpen: boolean) => void;
}

export function SecurityDialog({ docRef, isOpen, metadata, setIsOpen }: SecurityDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owners, setOwners] = useState("");
  const [editors, setEditors] = useState("");
  const [viewers, setViewers] = useState("");
  const [classification, setClassification] = useState("");
  const [markings, setMarkings] = useState("");

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setOwners(principalsToUserIds(metadata?.security?.discretionary?.owners));
      setEditors(principalsToUserIds(metadata?.security?.discretionary?.editors));
      setViewers(principalsToUserIds(metadata?.security?.discretionary?.viewers));
      setClassification(listToCsv(metadata?.security?.mandatory?.classification));
      setMarkings(listToCsv(metadata?.security?.mandatory?.markings));
      setError(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen, metadata]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, [setIsOpen]);

  const handleSave = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      const security: DocumentSecurity = {
        discretionary: {
          owners: userIdsToPrincipals(owners),
          editors: userIdsToPrincipals(editors),
          viewers: userIdsToPrincipals(viewers),
        },
        mandatory: {
          classification: csvToList(classification),
          markings: csvToList(markings),
        },
      };
      await app.state.updateDocument(docRef, { security });
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update security");
    } finally {
      setSaving(false);
    }
  }, [docRef, owners, editors, viewers, classification, markings, setIsOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit security"
    >
      <DialogBody>
        {error && (
          <Callout intent="danger" style={{ marginBottom: "15px" }}>
            {error}
          </Callout>
        )}
        <FormGroup
          label={<strong>Mandatory</strong>}
        >
          <FormGroup label="Classification" labelFor="security-classification">
            <InputGroup
              id="security-classification"
              value={classification}
              onValueChange={setClassification}
              placeholder="marking1, marking2, ..."
            />
          </FormGroup>
          <FormGroup label="Markings" labelFor="security-markings">
            <InputGroup
              id="security-markings"
              value={markings}
              onValueChange={setMarkings}
              placeholder="marking-id-1, marking-id-2, ..."
            />
          </FormGroup>
        </FormGroup>
        <FormGroup label={<strong>Discretionary</strong>}>
          <FormGroup label="Owners (UUID)" labelFor="security-owners">
            <InputGroup
              id="security-owners"
              value={owners}
              onValueChange={setOwners}
              placeholder="user1, user2, ..."
            />
          </FormGroup>
          <FormGroup label="Editors (UUID)" labelFor="security-editors">
            <InputGroup
              id="security-editors"
              value={editors}
              onValueChange={setEditors}
              placeholder="user1, user2, ..."
            />
          </FormGroup>
          <FormGroup label="Viewers (UUID)" labelFor="security-viewers">
            <InputGroup
              id="security-viewers"
              value={viewers}
              onValueChange={setViewers}
              placeholder="user1, user2, ..."
            />
          </FormGroup>
        </FormGroup>
      </DialogBody>
      <DialogFooter
        actions={
          <React.Fragment>
            <Button
              text="Cancel"
              onClick={handleClose}
              disabled={saving}
            />
            <Button
              text="Save"
              intent="primary"
              onClick={handleSave}
              disabled={saving}
              loading={saving}
            />
          </React.Fragment>
        }
      />
    </Dialog>
  );
}
