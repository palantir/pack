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

import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentSchema,
  Model,
  RecordId,
  RecordValidationError,
  UpgradeFns,
  UpgradeRegistry,
} from "@palantir/pack.document-schema.model-types";
import { Metadata, RecordInvalidError } from "@palantir/pack.document-schema.model-types";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { z } from "zod";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { BaseYjsDocumentService } from "../service/BaseYjsDocumentService.js";
import { createDocRef } from "../types/DocumentRefImpl.js";
import { getStateModule } from "../types/StateModule.js";
import { createTestApp } from "./testUtils.js";

interface User {
  id: string;
  name: string;
  age: number;
}

const createSchemaWithUser = () => {
  const userSchema = z.object({
    id: z.string(),
    name: z.string(),
    age: z.number().int().positive(),
  });

  const UserModel: Model<User, typeof userSchema> = {
    __type: {} as User,
    zodSchema: userSchema,
    [Metadata]: {
      name: "User",
    },
  };

  return {
    User: UserModel,
    [Metadata]: {
      version: 1,
    },
  } as const satisfies DocumentSchema;
};

const VALID_USER: User = {
  id: "user_1",
  name: "Jane Doe",
  age: 30,
};

describe("Record schema validation", () => {
  let app: PackAppInternal;

  beforeEach(() => {
    app = createTestApp();
  });

  /**
   * Reproduces the corruption scenario: a record exists in the Y.Doc but its
   * content does not match the model schema (e.g. an empty object after a
   * partial/failed write).
   */
  function corruptRecord(documentId: DocumentId, recordId: RecordId): void {
    const docService = app.getModule(DOCUMENT_SERVICE_MODULE_KEY);
    const yDoc = (docService as BaseYjsDocumentService).getYDocForTesting(documentId);
    if (!yDoc) {
      throw new Error("Y.Doc not found for document ID: " + documentId);
    }
    yDoc.transact(() => {
      yDoc.getMap("User").set(recordId as string, new Y.Map());
    }, "remote");
  }

  it("delivers valid snapshots to onChange and does not call onInvalid", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-valid-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    let changedCount = 0;
    let invalidCount = 0;

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {
      changedCount++;
    });
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, () => {
      invalidCount++;
    });

    await stateModule.setRecord(recordRef, VALID_USER);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedCount).toBeGreaterThan(0);
    expect(invalidCount).toBe(0);
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("withholds invalid snapshots from onChange and notifies onInvalid", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-invalid-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const changedSnapshots: unknown[] = [];
    let lastError: RecordValidationError | undefined;

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, snapshot => {
      changedSnapshots.push(snapshot);
    });
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, error => {
      lastError = error;
    });

    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedSnapshots).toHaveLength(0);
    expect(lastError).toBeDefined();
    expect(lastError?.modelName).toBe("User");
    expect(lastError?.recordId).toBe(userId);
    expect(lastError?.issues.length).toBeGreaterThan(0);

    const invalidRecords = stateModule.getInvalidRecords(docRef);
    expect(invalidRecords).toHaveLength(1);
    expect(invalidRecords[0]).toMatchObject({ modelName: "User", recordId: userId });

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("contains schemas whose synchronous safeParse throws", async () => {
    const asyncUserSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number().int().positive(),
    }).refine(() => Promise.resolve(true));
    const AsyncUserModel: Model<User, typeof asyncUserSchema> = {
      __type: {} as User,
      zodSchema: asyncUserSchema,
      [Metadata]: { name: "User" },
    };
    const schema = {
      User: AsyncUserModel,
      [Metadata]: { version: 1 },
    } as const satisfies DocumentSchema;

    const documentId = "validation-async-schema-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);
    const recordRef = stateModule.createRecordRef(docRef, "user_1" as RecordId, schema.User);

    let changedCount = 0;
    let validationError: RecordValidationError | undefined;
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {
      changedCount++;
    });
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, error => {
      validationError = error;
    });

    await expect(stateModule.setRecord(recordRef, VALID_USER)).resolves.toBeUndefined();

    expect(changedCount).toBe(0);
    expect(validationError?.issues[0]?.message).toContain("schema validation threw");
    await expect(recordRef.getSnapshot()).rejects.toBeInstanceOf(RecordInvalidError);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("notifies onInvalid immediately when subscribing to an already-invalid record", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-late-sub-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    // Load the document via a subscription, then corrupt the record.
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {});
    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));

    let lastError: RecordValidationError | undefined;
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, error => {
      lastError = error;
    });

    expect(lastError).toBeDefined();
    expect(lastError?.recordId).toBe(userId);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("rejects getSnapshot with RecordInvalidError for invalid records", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-snapshot-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    // Load the document via a subscription, then corrupt the record.
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {});
    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));

    await expect(recordRef.getSnapshot()).rejects.toBeInstanceOf(RecordInvalidError);
    await expect(recordRef.getSnapshot()).rejects.toMatchObject({
      validation: {
        modelName: "User",
        recordId: userId,
      },
    });

    unsubscribeChanged();
  });

  it("resumes onChange delivery and clears tracking when the record is repaired", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-repair-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const changedSnapshots: unknown[] = [];
    let invalidCount = 0;

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, snapshot => {
      changedSnapshots.push(snapshot);
    });
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, () => {
      invalidCount++;
    });

    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedSnapshots).toHaveLength(0);
    expect(invalidCount).toBeGreaterThan(0);
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    // Repair the record with valid data.
    await stateModule.setRecord(recordRef, VALID_USER);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedSnapshots.length).toBeGreaterThan(0);
    expect(changedSnapshots[changedSnapshots.length - 1]).toMatchObject(VALID_USER);
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("reports invalidRecordCount on the data channel status", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-status-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {});

    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(stateModule.getDocumentStatus(docRef).data.invalidRecordCount).toBe(1);

    await stateModule.setRecord(recordRef, VALID_USER);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(stateModule.getDocumentStatus(docRef).data.invalidRecordCount).toBeUndefined();

    unsubscribeChanged();
  });

  it("self-heals stale tracking when queried after a subscription-free repair", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-self-heal-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    // Track the corruption while a subscription exists...
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {});
    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    // ...then drop all subscriptions and repair without any listener installed.
    unsubscribeChanged();
    await stateModule.setRecord(recordRef, VALID_USER);
    await new Promise(resolve => setTimeout(resolve, 10));

    // The pull API re-validates and prunes the stale entry.
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);
    expect(stateModule.getDocumentStatus(docRef).data.invalidRecordCount).toBeUndefined();
  });

  it("clears a cached failure when subscribing after a subscription-free repair", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-resubscribe-repair-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const unsubscribeInitial = stateModule.onRecordChanged(recordRef, () => {});
    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    unsubscribeInitial();
    await stateModule.setRecord(recordRef, VALID_USER);

    let repairedSnapshot: User | undefined;
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, snapshot => {
      repairedSnapshot = snapshot;
    });

    expect(repairedSnapshot).toEqual(VALID_USER);
    expect(stateModule.getDocumentStatus(docRef).data.invalidRecordCount).toBeUndefined();
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);

    let invalidCount = 0;
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, () => {
      invalidCount++;
    });

    expect(invalidCount).toBe(0);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("clears tracking when an invalid record is deleted without subscribers", async () => {
    const schema = createSchemaWithUser();
    const documentId = "validation-delete-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_1" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, () => {});
    corruptRecord(documentId, userId);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);
    unsubscribeChanged();

    await stateModule.deleteRecord(recordRef);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);
  });

  it("tracks records with the same id under different models independently", async () => {
    const userSchema = z.object({
      id: z.string(),
      name: z.string(),
      age: z.number().int().positive(),
    });
    const postSchema = z.object({
      id: z.string(),
      title: z.string(),
    });
    interface Post {
      id: string;
      title: string;
    }
    const UserModel: Model<User, typeof userSchema> = {
      __type: {} as User,
      zodSchema: userSchema,
      [Metadata]: { name: "User" },
    };
    const PostModel: Model<Post, typeof postSchema> = {
      __type: {} as Post,
      zodSchema: postSchema,
      [Metadata]: { name: "Post" },
    };
    const schema = {
      User: UserModel,
      Post: PostModel,
      [Metadata]: { version: 1 },
    } as const satisfies DocumentSchema;

    const documentId = "validation-same-id-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const sharedId = "1" as RecordId;
    const userRef = stateModule.createRecordRef(docRef, sharedId, schema.User);
    const postRef = stateModule.createRecordRef(docRef, sharedId, schema.Post);

    // Load the doc and corrupt only User "1". Uses the promise read path to
    // avoid the (pre-existing) cross-model restriction in recordSubscriptions.
    await expect(userRef.getSnapshot()).rejects.toThrow();
    corruptRecord(documentId, sharedId);
    await expect(userRef.getSnapshot()).rejects.toBeInstanceOf(RecordInvalidError);
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    // A valid write + read of Post "1" must not clear User "1"'s entry.
    await stateModule.setRecord(postRef, { id: "1", title: "hello" });
    await expect(postRef.getSnapshot()).resolves.toMatchObject({ title: "hello" });

    const invalid = stateModule.getInvalidRecords(docRef);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ modelName: "User", recordId: sharedId });

    // An invalid Post read must not notify User subscribers sharing its ID.
    await stateModule.setRecord(userRef, { ...VALID_USER, id: "1" });
    await expect(userRef.getSnapshot()).resolves.toMatchObject({ id: "1" });
    let userInvalidCount = 0;
    const unsubscribe = stateModule.onRecordInvalid(userRef, () => {
      userInvalidCount++;
    });

    const docService = app.getModule(DOCUMENT_SERVICE_MODULE_KEY);
    const yDoc = (docService as BaseYjsDocumentService).getYDocForTesting(documentId);
    if (!yDoc) throw new Error("Y.Doc not found");
    yDoc.transact(() => {
      yDoc.getMap("Post").set(sharedId as string, new Y.Map());
    }, "remote");

    await expect(postRef.getSnapshot()).rejects.toBeInstanceOf(RecordInvalidError);
    expect(userInvalidCount).toBe(0);
    unsubscribe();
  });
});
describe("Record schema validation with a throwing upgrade lens", () => {
  let app: PackAppInternal;

  beforeEach(() => {
    app = createTestApp();
  });

  interface UserV2 {
    id: string;
    name: string;
    displayName: string;
  }

  /**
   * v2 schema where displayName is derived from name. The upgrade fn assumes
   * name is a string; corrupt data with a non-string name makes the lens
   * throw during snapshot computation.
   */
  const createLensedSchema = () => {
    const userSchema = z.object({
      id: z.string(),
      name: z.string(),
      displayName: z.string(),
    });

    const UserModel: Model<UserV2, typeof userSchema> = {
      __type: {} as UserV2,
      zodSchema: userSchema,
      [Metadata]: { name: "User" },
    };

    const registry: UpgradeRegistry = {
      allFields: {
        id: { type: { kind: "primitive" } },
        name: { type: { kind: "primitive" } },
        displayName: { type: { kind: "primitive" } },
      },
      modelName: "User",
      steps: [
        {
          addedInVersion: 2,
          fields: {
            displayName: {
              derivedFrom: ["name"],
            },
          },
        },
      ],
    };

    const upgradeFns: UpgradeFns = {
      User: {
        v2: {
          displayName: ({ name }: { readonly name: string }) => name.toUpperCase(),
        },
      },
    };

    return {
      User: UserModel,
      [Metadata]: {
        minSupportedVersion: 1,
        upgradeFns,
        upgrades: { User: registry },
        version: 2,
      },
    } as const satisfies DocumentSchema;
  };

  /** Writes raw field values for a record directly into the Y.Doc. */
  function writeRawRecord(
    documentId: DocumentId,
    recordId: RecordId,
    fields: Record<string, unknown>,
  ): void {
    const docService = app.getModule(DOCUMENT_SERVICE_MODULE_KEY);
    const yDoc = (docService as BaseYjsDocumentService).getYDocForTesting(documentId);
    if (!yDoc) {
      throw new Error("Y.Doc not found for document ID: " + documentId);
    }
    yDoc.transact(() => {
      const record = new Y.Map();
      for (const [key, value] of Object.entries(fields)) {
        record.set(key, value);
      }
      yDoc.getMap("User").set(recordId as string, record);
    }, "remote");
  }

  it("contains a throwing lens as an invalid record instead of an escaping exception", async () => {
    const schema = createLensedSchema();
    const documentId = "lens-throw-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_a" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const changedSnapshots: unknown[] = [];
    let lastError: RecordValidationError | undefined;

    const unsubscribeChanged = stateModule.onRecordChanged(recordRef, snapshot => {
      changedSnapshots.push(snapshot);
    });
    const unsubscribeInvalid = stateModule.onRecordInvalid(recordRef, error => {
      lastError = error;
    });

    // name present but non-string: the lens fires and throws inside toUpperCase.
    writeRawRecord(documentId, userId, { id: "user_a", name: 123 });
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(changedSnapshots).toHaveLength(0);
    expect(lastError).toBeDefined();
    expect(lastError?.modelName).toBe("User");
    expect(lastError?.issues[0]?.message).toContain("snapshot computation threw");
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    await expect(recordRef.getSnapshot()).rejects.toBeInstanceOf(RecordInvalidError);

    unsubscribeChanged();
    unsubscribeInvalid();
  });

  it("still notifies sibling records changed in the same transaction", async () => {
    const schema = createLensedSchema();
    const documentId = "lens-throw-sibling-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const corruptId = "user_a" as RecordId;
    const healthyId = "user_b" as RecordId;
    const corruptRef = stateModule.createRecordRef(docRef, corruptId, schema.User);
    const healthyRef = stateModule.createRecordRef(docRef, healthyId, schema.User);

    let corruptInvalid = false;
    const healthySnapshots: unknown[] = [];

    const unsubscribes = [
      stateModule.onRecordInvalid(corruptRef, () => {
        corruptInvalid = true;
      }),
      stateModule.onRecordChanged(corruptRef, () => {}),
      stateModule.onRecordChanged(healthyRef, snapshot => {
        healthySnapshots.push(snapshot);
      }),
    ];

    // One transaction touching both records: the corrupt one first, so an
    // escaping exception would have starved the healthy one's notification.
    const docService = app.getModule(DOCUMENT_SERVICE_MODULE_KEY);
    const yDoc = (docService as BaseYjsDocumentService).getYDocForTesting(documentId);
    if (!yDoc) throw new Error("Y.Doc not found");
    yDoc.transact(() => {
      const corrupt = new Y.Map();
      corrupt.set("id", "user_a");
      corrupt.set("name", 123);
      yDoc.getMap("User").set(corruptId as string, corrupt);

      const healthy = new Y.Map();
      healthy.set("id", "user_b");
      healthy.set("name", "bee");
      yDoc.getMap("User").set(healthyId as string, healthy);
    }, "remote");
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(corruptInvalid).toBe(true);
    expect(healthySnapshots).toHaveLength(1);
    // v1 data lensed on read: displayName derived from name.
    expect(healthySnapshots[0]).toMatchObject({
      id: "user_b",
      name: "bee",
      displayName: "BEE",
    });

    for (const unsubscribe of unsubscribes) unsubscribe();
  });

  it("rejects updateRecord on an unreadable record with RecordInvalidError", async () => {
    const schema = createLensedSchema();
    const documentId = "lens-throw-update-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_a" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const unsubscribe = stateModule.onRecordChanged(recordRef, () => {});
    writeRawRecord(documentId, userId, { id: "user_a", name: 123 });
    await new Promise(resolve => setTimeout(resolve, 10));

    await expect(stateModule.updateRecord(recordRef, { name: "fixed" }))
      .rejects.toBeInstanceOf(RecordInvalidError);

    unsubscribe();
  });

  it("keeps unreadable records deletable so delete-and-recreate repair works", async () => {
    const schema = createLensedSchema();
    const documentId = "lens-throw-delete-doc" as DocumentId;
    const docRef = createDocRef(app, documentId, schema);
    const stateModule = getStateModule(app);

    const userId = "user_a" as RecordId;
    const recordRef = stateModule.createRecordRef(docRef, userId, schema.User);

    const unsubscribe = stateModule.onRecordChanged(recordRef, () => {});
    writeRawRecord(documentId, userId, { id: "user_a", name: 123 });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(1);

    await expect(stateModule.deleteRecord(recordRef)).resolves.toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(stateModule.getInvalidRecords(docRef)).toHaveLength(0);

    unsubscribe();
  });
});
