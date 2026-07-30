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

import type { Logger } from "@osdk/api";
import type { Client } from "@osdk/client";
import type { AppConfig, ModuleKey, PackAppInternal } from "@palantir/pack.core";
import type {
  ActivityEvent,
  DocumentMetadata,
  DocumentSchema,
  EditDescription,
  Model,
  PresenceEvent,
  RecordId,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata, Metadata } from "@palantir/pack.document-schema.model-types";
import { DocumentLiveStatus, DocumentLoadStatus, getStateModule } from "@palantir/pack.state.core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDemoDocumentServiceConfig } from "../index.js";

const TEST_SECURITY = {
  discretionary: {
    editors: [],
    owners: [],
    viewers: [],
  },
  mandatory: {
    classification: ["MU"],
    markings: [],
  },
};

const TEST_DB_PREFIX = `test-${Date.now()}`;

function createTestApp(
  config: Partial<AppConfig & { moduleConfigs: Record<symbol, unknown> }> = {},
): PackAppInternal {
  const modules = new Map<symbol, unknown>();

  const docConfig = createDemoDocumentServiceConfig({ dbPrefix: TEST_DB_PREFIX });
  const allModuleConfigs = {
    [docConfig[0].key]: docConfig[1],
    ...config.moduleConfigs,
  };

  const osdkClient = {
    ontologyRid: "ri.ontology...test",
  } as unknown as Client;

  const app: PackAppInternal = {
    config: {
      app: {
        appId: "test-app-id",
        ...config.app,
      },
      isDemoMode: config.isDemoMode ?? true,
      logger: config.logger ?? consoleLogger({}),
      ontologyRid: Promise.resolve("ri.ontology...test"),
      osdkClient,
      remote: {
        baseUrl: "http://localhost",
        fetchFn: fetch,
        packEventsUrl: "http://localhost/api/v2/packSubscriptions/cometd",
        ...config.remote,
      },
    } satisfies AppConfig,
    getModule: <T, TConfig>(moduleKey: ModuleKey<T, TConfig>): T => {
      if (modules.has(moduleKey.key)) {
        return modules.get(moduleKey.key) as T;
      }

      const moduleConfig = allModuleConfigs[moduleKey.key] as TConfig;
      const instance = moduleKey.initModule(app, moduleConfig);
      modules.set(moduleKey.key, instance);

      if (moduleKey.appMemberName != null) {
        Object.defineProperty(app, moduleKey.appMemberName, {
          configurable: false,
          enumerable: true,
          get: () => instance,
        });
      }
      return instance;
    },
  };
  return app;
}

function consoleLogger(
  _bindings: Record<string, unknown>,
  _options?: { level?: string; msgPrefix?: string },
): Logger {
  return {
    child: consoleLogger,
    debug: console.debug,
    error: console.error,
    fatal: console.error,
    info: console.info,
    isLevelEnabled: () => true,
    trace: console.debug,
    warn: console.warn,
  } satisfies Logger;
}

const createTestSchema = (): DocumentSchema => ({
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema);

interface User {
  age: number;
  email: string;
  id: string;
  name: string;
}

const createSchemaWithRecords = () => {
  const userSchema = z.object({
    age: z.number().int().positive(),
    email: z.email(),
    id: z.string(),
    name: z.string(),
  });

  const UserModel: Model<User, typeof userSchema> = {
    __type: {} as User,
    [Metadata]: {
      name: "User",
    },
    zodSchema: userSchema,
  };

  return {
    [Metadata]: {
      version: 1,
    },
    User: UserModel,
  } as const satisfies DocumentSchema;
};

const createSchemaWithLensedActivity = () => {
  const recordSchema = z.object({
    id: z.string(),
  });

  const TestRecordModel: Model<{ id: string }, typeof recordSchema> = {
    __type: {} as { id: string },
    [Metadata]: {
      name: "TestRecord",
    },
    zodSchema: recordSchema,
  };

  const shapeUpdatedActivitySchema = z.object({
    nodeId: z.string(),
    summary: z.string(),
  });

  const ShapeUpdatedActivityModel: Model<
    { nodeId: string; summary: string },
    typeof shapeUpdatedActivitySchema
  > = {
    __type: {} as { nodeId: string; summary: string },
    [Metadata]: {
      name: "ShapeUpdatedActivity",
    },
    zodSchema: shapeUpdatedActivitySchema,
  };

  return {
    [Metadata]: {
      minSupportedVersion: 1,
      upgradeFns: {
        ShapeUpdatedActivity: {
          v2: {
            summary: ({ nodeId }: { readonly nodeId: string }) => `Updated shape ${nodeId}`,
          },
        },
      },
      upgrades: {
        ShapeUpdatedActivity: {
          allFields: {
            nodeId: { type: { kind: "primitive" } },
            summary: { type: { kind: "primitive" } },
          },
          modelName: "ShapeUpdatedActivity",
          steps: [
            {
              addedInVersion: 2,
              fields: {
                summary: {
                  derivedFrom: ["nodeId"],
                },
              },
            },
          ],
        },
        TestRecord: {
          allFields: {
            id: { type: { kind: "primitive" } },
          },
          modelName: "TestRecord",
          steps: [],
        },
      },
      version: 2,
    },
    ShapeUpdatedActivity: ShapeUpdatedActivityModel,
    TestRecord: TestRecordModel,
  } as const satisfies DocumentSchema;
};

describe("DemoDocumentService", () => {
  let app: PackAppInternal;

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it("should create and load a document", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Test Document",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createTestSchema();
    const docRef = await stateModule.createDocument(metadata, schema);

    expect(docRef).toBeDefined();
    expect(docRef.id).toBeDefined();
    expect(typeof docRef.id).toBe("string");
  });

  it("should expose operationalVersion in demo metadata", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Versioned Document",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createTestSchema();
    const docRef = await stateModule.createDocument(metadata, schema);
    const updatedMetadata = await stateModule.updateDocument(docRef, {
      operationalVersion: 2,
    });

    expect(updatedMetadata.operationalVersion).toBe(2);
    expect(docRef.version).toBe(2);
  });

  it("should persist document and load it across service instances", async () => {
    const stateModule1 = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Persistent Document",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createSchemaWithRecords();
    const docRef = await stateModule1.createDocument(metadata, schema);

    const userCollection = docRef.getRecords(schema.User);
    await stateModule1.setCollectionRecord(userCollection, "user1" as RecordId, {
      age: 30,
      email: "test@example.com",
      id: "user1",
      name: "Test User",
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const app2 = createTestApp();
    const stateModule2 = getStateModule(app2);

    const foundDocs = await stateModule2.searchDocuments("TestType", schema);
    expect(foundDocs.data.length).toBeGreaterThan(0);

    const foundDoc = foundDocs.data.find(d => d.id === docRef.id);
    expect(foundDoc).toBeDefined();
    expect(foundDoc?.name).toBe("Persistent Document");
  });

  it("should handle document subscriptions and status changes", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Status Test Document",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createTestSchema();
    const docRef = await stateModule.createDocument(metadata, schema);

    const statusUpdates: Array<{ data: any; metadata: any }> = [];

    const unsubscribe = stateModule.onStatusChange(docRef, (_, status) => {
      statusUpdates.push({
        data: { ...status.data },
        metadata: { ...status.metadata },
      });
    });

    const unsubscribeData = stateModule.onStateChange(docRef, () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(statusUpdates.length).toBeGreaterThan(0);
    const lastUpdate = statusUpdates[statusUpdates.length - 1];
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate?.data.load).toBe(DocumentLoadStatus.LOADED);
    expect(lastUpdate?.data.live).toBe(DocumentLiveStatus.CONNECTED);

    unsubscribeData();
    unsubscribe();
  });

  it("should search documents by type", async () => {
    const stateModule = getStateModule(app);

    const metadata1: DocumentMetadata = {
      documentTypeName: "TypeA",
      name: "Doc A1",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const metadata2: DocumentMetadata = {
      documentTypeName: "TypeA",
      name: "Doc A2",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const metadata3: DocumentMetadata = {
      documentTypeName: "TypeB",
      name: "Doc B1",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createTestSchema();
    await stateModule.createDocument(metadata1, schema);
    await stateModule.createDocument(metadata2, schema);
    await stateModule.createDocument(metadata3, schema);

    const typeADocs = await stateModule.searchDocuments("TypeA", schema);
    expect(typeADocs.data.length).toBeGreaterThanOrEqual(2);

    const typeANames = typeADocs.data.map(doc => doc.name);
    expect(typeANames).toContain("Doc A1");
    expect(typeANames).toContain("Doc A2");
  });

  it("should handle presence events across multiple subscribers", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Presence Test",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createTestSchema();
    const docRef = await stateModule.createDocument(metadata, schema);

    const presenceEvents: PresenceEvent[] = [];

    const unsubscribe1 = stateModule.onPresence(docRef, (_, event) => {
      presenceEvents.push(event);
    });

    const app2 = createTestApp();
    const stateModule2 = getStateModule(app2);
    const docRef2 = stateModule2.createDocRef(docRef.id, schema);

    const unsubscribe2 = stateModule2.onPresence(docRef2, () => {});

    await vi.waitFor(() => {
      expect(presenceEvents.length).toBeGreaterThan(0);
      const arriveEvents = presenceEvents.filter(e => e.eventData.type === "presenceArrived");
      expect(arriveEvents.length).toBeGreaterThan(0);
    }, { timeout: 10000 });

    unsubscribe1();
    unsubscribe2();
  });

  it("should handle activity events", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Activity Test",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createSchemaWithRecords();
    const docRef = await stateModule.createDocument(metadata, schema);

    const activityEvents: ActivityEvent[] = [];

    const app2 = createTestApp();
    const stateModule2 = getStateModule(app2);
    const docRef2 = stateModule2.createDocRef(docRef.id, schema);

    const unsubscribe = stateModule2.onActivity(docRef2, (_, event) => {
      activityEvents.push(event);
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const userCollection = docRef.getRecords(schema.User);
    void docRef.withTransaction(() => {
      return stateModule.setCollectionRecord(userCollection, "activity-user" as RecordId, {
        age: 25,
        email: "activity@example.com",
        id: "activity-user",
        name: "Activity User",
      });
    }, {
      data: {
        age: 25,
        email: "activity@example.com",
        id: "activity-user",
        name: "Activity User",
      },
      model: schema.User,
    });

    await vi.waitFor(() => {
      expect(activityEvents.length).toBeGreaterThan(0);
    }, { timeout: 1000 });

    const firstEvent = activityEvents[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent?.eventData.type === "customEvent") {
      expect(getMetadata(firstEvent.eventData.model).name).toBe("User");
    }

    unsubscribe();
  });

  it("should lens custom activity payloads from older schema versions", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Activity Lens Test",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createSchemaWithLensedActivity();
    const docRef = await stateModule.createDocument(metadata, schema);

    const activityEvents: ActivityEvent[] = [];

    const app2 = createTestApp();
    const stateModule2 = getStateModule(app2);
    const docRef2 = stateModule2.createDocRef(docRef.id, schema);

    const unsubscribe = stateModule2.onActivity(docRef2, (_, event) => {
      activityEvents.push(event);
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const recordCollection = docRef.getRecords(schema.TestRecord);
    const description = {
      data: {
        nodeId: "shape-1",
      },
      model: schema.ShapeUpdatedActivity,
      schemaVersion: 1,
    } as EditDescription;

    void docRef.withTransaction(() => {
      return stateModule.setCollectionRecord(recordCollection, "record-1" as RecordId, {
        id: "record-1",
      });
    }, description);

    await vi.waitFor(() => {
      expect(activityEvents.length).toBeGreaterThan(0);
    }, { timeout: 1000 });

    const firstEvent = activityEvents[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent?.eventData.type === "customEvent") {
      expect(firstEvent.eventData.schemaVersion).toBe(1);
      expect(firstEvent.eventData.data).toEqual({
        nodeId: "shape-1",
        summary: "Updated shape shape-1",
      });
    }

    unsubscribe();
  });

  it("should handle record operations", async () => {
    const stateModule = getStateModule(app);

    const metadata: DocumentMetadata = {
      documentTypeName: "TestType",
      name: "Record Test",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    };

    const schema = createSchemaWithRecords();
    const docRef = await stateModule.createDocument(metadata, schema);

    const unsubscribeState = stateModule.onStateChange(docRef, () => {});
    await new Promise(resolve => setTimeout(resolve, 100));

    const userCollection = docRef.getRecords(schema.User);

    await stateModule.setCollectionRecord(userCollection, "user1" as RecordId, {
      age: 30,
      email: "user1@example.com",
      id: "user1",
      name: "User One",
    });

    const userRef = userCollection.get("user1");
    expect(userRef).toBeDefined();
    const userData = await userRef?.getSnapshot();
    expect(userData?.name).toBe("User One");
    expect(userData?.age).toBe(30);

    unsubscribeState();
  });

  it("should reset data liveness when the last data subscription is an onRecordInvalid", async () => {
    const stateModule = getStateModule(app);

    const schema = createSchemaWithRecords();
    const docRef = await stateModule.createDocument({
      documentTypeName: "TestType",
      name: "Record Invalid Teardown",
      ontologyRid: "test-ontology-rid",
      security: TEST_SECURITY,
    }, schema);

    const recordRef = stateModule.createRecordRef(docRef, "user1" as RecordId, schema.User);
    const unsubscribe = stateModule.onRecordInvalid(recordRef, () => {});
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(stateModule.getDocumentStatus(docRef).data.live).toBe(DocumentLiveStatus.CONNECTED);

    // This teardown path used to bypass the shared close path, leaving data.live CONNECTED after
    // the underlying provider and update handler had already been disposed.
    unsubscribe();

    const status = stateModule.getDocumentStatus(docRef);
    expect(status.data.live).toBe(DocumentLiveStatus.DISCONNECTED);
    expect(status.data.load).toBe(DocumentLoadStatus.UNLOADED);
  });

  describe("metadata liveness", () => {
    async function createDoc(stateModule: ReturnType<typeof getStateModule>) {
      const docRef = await stateModule.createDocument({
        documentTypeName: "TestType",
        name: "Metadata Liveness Document",
        ontologyRid: "test-ontology-rid",
        security: TEST_SECURITY,
      }, createTestSchema());
      return docRef;
    }

    const settle = () => new Promise(resolve => setTimeout(resolve, 100));

    it("should not regress the load status when metadata is already available", async () => {
      const stateModule = getStateModule(app);
      const docRef = await createDoc(stateModule);
      await settle();
      expect(stateModule.getDocumentStatus(docRef).metadata.load).toBe(DocumentLoadStatus.LOADED);

      const loads: DocumentLoadStatus[] = [];
      const unsubscribeStatus = stateModule.onStatusChange(docRef, (_, status) => {
        loads.push(status.metadata.load);
      });

      // Opening a metadata subscription re-reports liveness, but the metadata is already held,
      // so consumers gating on `load === LOADED` must not see a loading flash and
      // waitForMetadataLoad must stay immediate.
      const unsubscribe = stateModule.onMetadataChange(docRef, () => {});
      await settle();

      expect(loads).not.toContain(DocumentLoadStatus.LOADING);
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.CONNECTED,
      );

      unsubscribe();
      unsubscribeStatus();
    });

    it("should restore CONNECTED when metadata is resubscribed after closing", async () => {
      const stateModule = getStateModule(app);
      const docRef = await createDoc(stateModule);

      const unsubscribeFirst = stateModule.onMetadataChange(docRef, () => {});
      await settle();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.CONNECTED,
      );

      unsubscribeFirst();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.DISCONNECTED,
      );

      // Reopening must re-report liveness. Keying the open guard off `load` latched the
      // indicator at DISCONNECTED for the document's lifetime once metadata had loaded.
      const unsubscribeSecond = stateModule.onMetadataChange(docRef, () => {});
      await settle();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.CONNECTED,
      );

      unsubscribeSecond();
    });

    it("should stay CONNECTED while a data subscription still needs metadata", async () => {
      const stateModule = getStateModule(app);
      const docRef = await createDoc(stateModule);

      const unsubscribeData = stateModule.onStateChange(docRef, () => {});
      const unsubscribeMetadata = stateModule.onMetadataChange(docRef, () => {});
      await settle();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.CONNECTED,
      );

      // Data subscriptions drive metadata via ensureMetadataLoaded, so metadata is still live
      // after the last metadata subscriber leaves.
      unsubscribeMetadata();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.CONNECTED,
      );

      unsubscribeData();
      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.DISCONNECTED,
      );
    });

    it("should not report CONNECTED when the subscription closes while metadata loads", async () => {
      const schema = createTestSchema();
      const createdRef = await getStateModule(app).createDocument({
        documentTypeName: "TestType",
        name: "Metadata Liveness Reload Document",
        ontologyRid: "test-ontology-rid",
        security: TEST_SECURITY,
      }, schema);
      await settle();

      // A second service instance is used because its metadataStore has not resolved for this
      // document yet, so the load is genuinely in flight when the unsubscribe lands.
      const stateModule = getStateModule(createTestApp());
      const docRef = stateModule.createDocRef(createdRef.id, schema);

      // Unsubscribe before the in-flight load resolves; its continuation must not resurrect
      // CONNECTED on a channel nobody is listening to.
      const unsubscribe = stateModule.onMetadataChange(docRef, () => {});
      unsubscribe();
      await settle();

      expect(stateModule.getDocumentStatus(docRef).metadata.live).toBe(
        DocumentLiveStatus.DISCONNECTED,
      );
    });
  });
});
