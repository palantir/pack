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

import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  Model,
  PublishedVersion,
  RecordId,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { BaseYjsDocumentService } from "../service/BaseYjsDocumentService.js";
import { openPublishedVersionDocRef } from "../service/PublishedVersionDocumentService.js";
import { DocumentLiveStatus, DocumentLoadStatus } from "../types/DocumentService.js";
import type { StateModule } from "../types/StateModule.js";
import { getStateModule, isPublishedVersionDocRef } from "../types/StateModule.js";
import { createTestApp } from "./testUtils.js";

interface User {
  id: string;
  name: string;
}

const userSchema = z.object({ id: z.string(), name: z.string() });

const UserModel: Model<User, typeof userSchema> = {
  __type: {} as User,
  zodSchema: userSchema,
  [Metadata]: { name: "User" },
};

const schema = {
  [Metadata]: { version: 1 },
  User: UserModel,
} as const satisfies DocumentSchema;

const METADATA: DocumentMetadata = {
  documentTypeName: "TestType",
  name: "Test Document",
  ontologyRid: "test-ontology-rid",
  security: {
    discretionary: { editors: [], owners: [], viewers: [] },
    mandatory: { classification: ["MU"], markings: [] },
  },
};

const ALICE = { id: "alice", name: "Alice" };
const ALICE_ID = "alice" as RecordId;

const V7: PublishedVersion = { createdAt: "2026-01-01T00:00:00Z", name: "v7", ref: "v7" };

describe("PublishedVersionDocumentService", () => {
  let app: PackAppInternal;
  let liveDraft: DocumentRef<typeof schema>;
  let service: BaseYjsDocumentService;
  let state: StateModule;
  let contents: Uint8Array;

  // Opens a read-only copy of the live draft as it was when the test started.
  const openCopy = () => openPublishedVersionDocRef(app, service, liveDraft, contents, V7);

  beforeEach(async () => {
    app = createTestApp();
    state = getStateModule(app);
    service = app.getModule(DOCUMENT_SERVICE_MODULE_KEY) as BaseYjsDocumentService;

    liveDraft = await state.createDocument(METADATA, schema);
    await state.setCollectionRecord(liveDraft.getRecords(UserModel), ALICE_ID, ALICE);
    contents = Y.encodeStateAsUpdate(service.getYDocForTesting(liveDraft.id)!);
  });

  it("reads the snapshot through records and collections", async () => {
    const published = openCopy();

    expect(isPublishedVersionDocRef(published)).toBe(true);
    expect(isPublishedVersionDocRef(liveDraft)).toBe(false);
    expect(published.id).toBe(liveDraft.id);
    expect(published.publishedVersion).toBe(V7);

    const users = published.getRecords(UserModel);
    expect(users.size).toBe(1);
    expect([...users].map(user => user.id)).toEqual(["alice"]);
    await expect(users.get(ALICE_ID)?.getSnapshot()).resolves.toEqual(ALICE);

    const onChange = vi.fn();
    const unsubscribe = users.get(ALICE_ID)!.onChange(onChange);
    expect(onChange).toHaveBeenCalledWith(ALICE, users.get(ALICE_ID));
    unsubscribe();
  });

  it("does not see live draft edits made after it was loaded", async () => {
    const published = openCopy();

    const liveDraftUsers = liveDraft.getRecords(UserModel);
    await state.setCollectionRecord(liveDraftUsers, "bob" as RecordId, { id: "bob", name: "Bob" });
    await state.updateRecord(liveDraftUsers.get(ALICE_ID)!, { name: "Alice Renamed" });

    expect(liveDraftUsers.size).toBe(2);
    expect(published.getRecords(UserModel).size).toBe(1);
    await expect(published.getRecords(UserModel).get(ALICE_ID)?.getSnapshot()).resolves.toEqual(
      ALICE,
    );
  });

  it("rejects every write and leaves the live draft untouched", async () => {
    const published = openCopy();
    const publishedUsers = published.getRecords(UserModel);
    const publishedAlice = publishedUsers.get(ALICE_ID)!;
    const liveDraftAlice = liveDraft.getRecords(UserModel).get(ALICE_ID)!;
    const bob = { id: "bob", name: "Bob" };

    await expect(state.setCollectionRecord(publishedUsers, "bob" as RecordId, bob)).rejects
      .toThrow("read-only");
    await expect(state.setRecord(publishedAlice, bob)).rejects.toThrow("read-only");
    await expect(state.updateRecord(publishedAlice, { name: "Changed" })).rejects.toThrow(
      "read-only",
    );
    await expect(state.deleteRecord(publishedAlice)).rejects.toThrow("read-only");
    await expect(publishedAlice.delete()).rejects.toThrow("read-only");
    await expect(publishedUsers.delete(ALICE_ID)).rejects.toThrow("read-only");
    await expect(published.setRecord(UserModel, "bob" as RecordId, bob as never)).rejects.toThrow(
      "read-only",
    );
    // These take the record's own ref, so a live draft record must not be edited through the
    // published version doc ref.
    await expect(published.updateRecord(liveDraftAlice, { name: "Changed" } as never)).rejects
      .toThrow(
        "read-only",
      );
    await expect(published.deleteRecord(liveDraftAlice)).rejects.toThrow("read-only");
    expect(() => published.withTransaction(() => {})).toThrow("read-only");

    await expect(liveDraftAlice.getSnapshot()).resolves.toEqual(ALICE);
    expect(liveDraft.getRecords(UserModel).size).toBe(1);
    expect(publishedUsers.size).toBe(1);
  });

  it("rejects document-level writes without reaching the live draft service", async () => {
    const published = openCopy();
    const liveDraftWrites = [
      vi.spyOn(service, "updateDocument"),
      vi.spyOn(service, "deleteDocument"),
    ];

    await expect(state.updateDocument(published, { name: "Renamed" })).rejects.toThrow(
      "read-only",
    );
    await expect(state.deleteDocument(published)).rejects.toThrow("read-only");

    for (const liveDraftWrite of liveDraftWrites) {
      expect(liveDraftWrite).not.toHaveBeenCalled();
    }
  });

  it("is loaded and disconnected, and loaded again after resubscribing", async () => {
    const published = openCopy();
    const loaded = { live: DocumentLiveStatus.DISCONNECTED, load: DocumentLoadStatus.LOADED };

    expect(state.getDocumentStatus(published).data).toMatchObject(loaded);
    // Status for the published version doc ref comes from its own copy, not the live draft.
    expect(state.getDocumentStatus(liveDraft).data.load).toBe(DocumentLoadStatus.UNLOADED);

    const unsubscribe = published.onStateChange(() => {});
    await expect(state.waitForDataLoad(published)).resolves.toBeUndefined();
    unsubscribe();
    expect(state.getDocumentStatus(published).data.load).toBe(DocumentLoadStatus.UNLOADED);

    const unsubscribeAgain = published.onStateChange(() => {});
    expect(state.getDocumentStatus(published).data).toMatchObject(loaded);
    unsubscribeAgain();
  });

  it("keeps the live draft ref stable and borrows the live draft's metadata and version", () => {
    const published = openCopy();

    expect(state.createDocRef(liveDraft.id, schema)).toBe(liveDraft);
    expect(state.createRecordRef(published, ALICE_ID, UserModel).docRef).toBe(published);
    expect(published.getRecords(UserModel).docRef).toBe(published);
    expect(published.version).toBe(liveDraft.version);

    const onMetadataChange = vi.fn();
    const unsubscribe = published.onMetadataChange(onMetadataChange);
    expect(onMetadataChange).toHaveBeenCalledWith(
      published,
      expect.objectContaining({ name: "Test Document" }),
    );
    unsubscribe();
  });

  it("fails instead of reading the live draft for a copy of a published version doc ref", () => {
    const copy = { ...openCopy() } as unknown as DocumentRef<typeof schema>;

    expect(() => state.getDocumentStatus(copy)).toThrow("is a copy");
  });

  it("throws when the contents can't be applied", () => {
    const badContents = new Uint8Array([255, 255, 255]);
    expect(() => openPublishedVersionDocRef(app, service, liveDraft, badContents, V7)).toThrow();
  });
});
