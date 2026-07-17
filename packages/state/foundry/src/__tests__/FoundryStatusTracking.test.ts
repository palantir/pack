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

import type {
  ActivityCollaborativeUpdate,
  Document,
  DocumentMetadataUpdate,
  PresenceCollaborativeUpdate,
} from "@osdk/foundry.pack";
import { Documents } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentId, DocumentSchema } from "@palantir/pack.document-schema.model-types";
import { ChannelErrorCode, Metadata } from "@palantir/pack.document-schema.model-types";
import { createDocRef, DocumentLoadStatus, type DocumentStatus } from "@palantir/pack.state.core";
import type {
  FoundryEventService,
  SubscriptionId,
  SyncSession,
} from "@palantir/pack.state.foundry-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import type { FoundryDocumentService } from "../FoundryDocumentService.js";
import { internalCreateFoundryDocumentService } from "../FoundryDocumentService.js";

/* eslint-disable @typescript-eslint/unbound-method */

vi.mock("@osdk/foundry.pack", () => ({
  Documents: {
    deleteDocument: vi.fn(),
    get: vi.fn(),
  },
}));

const mockAuthModule = {
  getCurrentUser: vi.fn().mockReturnValue({ userId: "local-user" }),
  onTokenChange: vi.fn(),
  getToken: vi.fn().mockReturnValue("mock-token"),
};

const mockLogger = {
  child: vi.fn(),
  debug: vi.fn((...args: unknown[]) => {
    console.log("[DEBUG]", ...args);
  }),
  error: vi.fn((...args: unknown[]) => {
    console.error("[ERROR]", ...args);
  }),
  info: vi.fn((...args: unknown[]) => {
    console.log("[INFO]", ...args);
  }),
  warn: vi.fn((...args: unknown[]) => {
    console.warn("[WARN]", ...args);
  }),
};

mockLogger.child.mockReturnValue(mockLogger);

const mockOsdkClient = {};

const mockApp = {
  getModule: vi.fn().mockReturnValue(mockAuthModule),
  config: {
    logger: mockLogger,
    osdkClient: mockOsdkClient,
    remote: {
      packEventsUrl: "https://test.example.com/ws/cometd",
      baseUrl: "https://test.example.com",
    },
  },
} as unknown as PackAppInternal;

const testSchema = {
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

const mockDocument: Document = {
  id: "test-doc",
  name: "Test Document",
  documentTypeName: "TestType",
  ontologyRid: "ri.ontology..test-rid",
  createdBy: "user-1",
  createdTime: "2025-01-01T00:00:00Z",
  updatedBy: "user-1",
  updatedTime: "2025-01-01T00:00:00Z",
  operations: ["VIEW", "EDIT", "OWN", "DELETE"],
  security: {
    mandatory: {
      classification: [],
      markings: [],
    },
    discretionary: {
      owners: [],
      editors: [],
      viewers: [],
    },
  },
};

describe("Foundry Document Status Tracking", () => {
  let mockEventService: MockProxy<FoundryEventService>;
  let service: FoundryDocumentService;
  let sessionCounter: number;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEventService = mock();
    sessionCounter = 0;

    vi.mocked(Documents.get).mockResolvedValue(mockDocument);

    mockEventService.startDocumentSync.mockImplementation(
      (documentId, _yDoc, _clientSupportedVersionRange, onStatusChange) => {
        const session: SyncSession = {
          clientId: `test-client-${++sessionCounter}`,
          documentId,
        };

        void Promise.resolve().then(() => {
          onStatusChange({
            load: DocumentLoadStatus.LOADED,
          });
        });

        return session;
      },
    );

    mockEventService.stopDocumentSync.mockImplementation(() => {});
    mockEventService.subscribeToMetadataUpdates.mockResolvedValue("mock-sub-id" as SubscriptionId);
    vi.mocked(Documents.deleteDocument).mockResolvedValue(undefined);

    service = internalCreateFoundryDocumentService(mockApp, {}, mockEventService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(Documents.deleteDocument).mockClear();
    vi.mocked(Documents.get).mockClear();
  });

  describe("metadata loading", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should load metadata from backend on metadata subscription", async () => {
      const docRef = createDocRef(mockApp, "test-doc-1" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];

      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledWith(mockOsdkClient, "test-doc-1", {
        preview: true,
      });

      const finalStatus = statusUpdates.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.metadata.load).toBe(DocumentLoadStatus.LOADED);
      expect(finalStatus?.metadata.error).toBeUndefined();
    });

    it("should handle backend loading errors", async () => {
      const error = new Error("Backend failed");
      vi.mocked(Documents.get).mockRejectedValueOnce(error);

      const docRef = createDocRef(mockApp, "test-doc-2" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];

      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      const finalStatus = statusUpdates.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.metadata.load).toBe(DocumentLoadStatus.ERROR);
      expect(finalStatus?.metadata.error).toMatchObject({
        code: ChannelErrorCode.UNKNOWN,
        message: "Failed to load document metadata",
      });
    });

    it("should not reload from backend if already loaded", async () => {
      const docRef = createDocRef(mockApp, "test-doc-3" as DocumentId, testSchema);

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      vi.mocked(Documents.get).mockClear();

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(Documents.get).not.toHaveBeenCalled();
    });

    it("should handle concurrent subscriptions efficiently", async () => {
      const docRef = createDocRef(mockApp, "test-doc-4" as DocumentId, testSchema);

      unsubscribes.push(
        service.onMetadataChange(docRef, () => {}),
        service.onMetadataChange(docRef, () => {}),
        service.onMetadataChange(docRef, () => {}),
      );

      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledTimes(1);
    });

    it("should reject waitForLoad promises on error", async () => {
      const error = new Error("Test failure!");
      vi.mocked(Documents.get).mockRejectedValueOnce(error);

      const docRef = createDocRef(mockApp, "test-doc-5" as DocumentId, testSchema);

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));

      await expect(service.waitForMetadataLoad(docRef)).rejects.toThrow("Metadata load error");
    });

    it("should resolve waitForLoad promises when already loaded", async () => {
      const docRef = createDocRef(mockApp, "test-doc-6" as DocumentId, testSchema);

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      await expect(service.waitForMetadataLoad(docRef)).resolves.toBeUndefined();
    });

    it("should refresh and reopen metadata when a new subscriber joins", async () => {
      mockEventService.subscribeToMetadataUpdates
        .mockResolvedValueOnce("metadata-sub-1" as SubscriptionId)
        .mockResolvedValueOnce("metadata-sub-2" as SubscriptionId);
      const docRef = createDocRef(mockApp, "test-doc-metadata-reopen" as DocumentId, testSchema);

      const unsubscribeFirst = service.onMetadataChange(docRef, () => {});
      await vi.runAllTimersAsync();
      unsubscribeFirst();

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("metadata-sub-1");

      vi.mocked(Documents.get).mockClear();
      const unsubscribeSecond = service.onMetadataChange(docRef, () => {});
      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledTimes(1);
      expect(mockEventService.subscribeToMetadataUpdates).toHaveBeenCalledTimes(2);

      unsubscribeSecond();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("metadata-sub-2");
    });

    it("should discard a metadata subscription that resolves after demand closes", async () => {
      let resolveSubscription: (subscriptionId: SubscriptionId) => void = () => {};
      mockEventService.subscribeToMetadataUpdates.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSubscription = resolve;
          }),
      );
      const docRef = createDocRef(mockApp, "test-doc-metadata-stale" as DocumentId, testSchema);

      const unsubscribe = service.onMetadataChange(docRef, () => {});
      await vi.runAllTimersAsync();
      unsubscribe();

      resolveSubscription("stale-metadata-sub" as SubscriptionId);
      await vi.runAllTimersAsync();

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("stale-metadata-sub");
    });

    it("should discard a metadata refetch from a deleted document generation", async () => {
      let metadataUpdateCallback: (update: DocumentMetadataUpdate) => void = () => {};
      mockEventService.subscribeToMetadataUpdates.mockImplementation(
        (_documentId, callback) => {
          metadataUpdateCallback = callback;
          return Promise.resolve("metadata-sub" as SubscriptionId);
        },
      );
      const docRef = createDocRef(mockApp, "test-doc-metadata-refetch" as DocumentId, testSchema);
      service.onMetadataChange(docRef, () => {});
      await vi.runAllTimersAsync();

      let resolveRefetch: (document: Document) => void = () => {};
      vi.mocked(Documents.get).mockReturnValueOnce(
        new Promise(resolve => {
          resolveRefetch = resolve;
        }),
      );
      metadataUpdateCallback({} as DocumentMetadataUpdate);

      await service.deleteDocument(docRef);
      const recreatedDocRef = service.createDocRef(docRef.id, testSchema);
      const names: string[] = [];
      service.onMetadataChange(recreatedDocRef, (_ref, metadata) => {
        names.push(metadata.name);
      });
      await vi.runAllTimersAsync();

      resolveRefetch({ ...mockDocument, name: "Stale name" });
      await vi.runAllTimersAsync();

      expect(names).not.toContain("Stale name");
    });
  });

  describe("websocket data loading", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should load data via websocket on data subscription", async () => {
      const docRef = createDocRef(mockApp, "test-doc-7" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];

      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      // Opening a data subscription also loads metadata so docRef.version
      // (operationalVersion) is correct whenever document state is loaded.
      expect(Documents.get).toHaveBeenCalled();
      expect(mockEventService.startDocumentSync).toHaveBeenCalled();

      const finalStatus = statusUpdates.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.data.load).toBe(DocumentLoadStatus.LOADED);
      expect(finalStatus?.data.error).toBeUndefined();
    });

    it("should wait for metadata before starting websocket data sync", async () => {
      let resolveMetadata: (document: Document) => void = () => {};
      vi.mocked(Documents.get).mockReturnValueOnce(
        new Promise<Document>(resolve => {
          resolveMetadata = resolve;
        }),
      );

      const docRef = createDocRef(mockApp, "test-doc-8" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      expect(Documents.get).toHaveBeenCalled();
      expect(mockEventService.startDocumentSync).not.toHaveBeenCalled();
      expect(statusUpdates.at(-1)?.data.load).toBe(DocumentLoadStatus.LOADING);

      resolveMetadata({ ...mockDocument, operationalVersion: 3 } as Document);
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalled();
      const getOperationalVersion = mockEventService.startDocumentSync.mock.calls[0]?.[4];
      expect(getOperationalVersion?.()).toBe(3);
    });

    it("should handle fast unsubscribe before websocket data sync starts", async () => {
      let resolveMetadata: (document: Document) => void = () => {};
      vi.mocked(Documents.get).mockReturnValueOnce(
        new Promise(resolve => {
          resolveMetadata = resolve;
        }),
      );
      const docRef = createDocRef(mockApp, "test-doc-13" as DocumentId, testSchema);
      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      const unsubscribeState = service.onStateChange(docRef, () => {});
      const metadataWait = service.waitForMetadataLoad(docRef);

      unsubscribeState();

      expect(statusUpdates.at(-1)?.metadata.load).toBe(DocumentLoadStatus.UNLOADED);
      await expect(metadataWait).rejects.toThrow("Metadata load canceled");

      resolveMetadata(mockDocument);
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).not.toHaveBeenCalled();
      expect(mockEventService.stopDocumentSync).not.toHaveBeenCalled();

      unsubscribes.push(service.onStateChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalled();
    });

    it("should not let a canceled metadata wait fail reopened data", async () => {
      let resolveFirst: (document: Document) => void = () => {};
      let resolveSecond: (document: Document) => void = () => {};
      vi.mocked(Documents.get)
        .mockImplementationOnce(() =>
          new Promise(resolve => {
            resolveFirst = resolve;
          })
        )
        .mockImplementationOnce(() =>
          new Promise(resolve => {
            resolveSecond = resolve;
          })
        );
      const docRef = createDocRef(mockApp, "test-doc-data-reopen-race" as DocumentId, testSchema);
      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      const unsubscribeFirst = service.onStateChange(docRef, () => {});
      unsubscribeFirst();
      unsubscribes.push(service.onStateChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(statusUpdates.at(-1)?.data.load).toBe(DocumentLoadStatus.LOADING);

      resolveSecond(mockDocument);
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalledTimes(1);
      expect(statusUpdates.at(-1)?.data.load).toBe(DocumentLoadStatus.LOADED);

      resolveFirst(mockDocument);
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalledTimes(1);
    });

    it("should reopen websocket data sync after loaded subscription closes", async () => {
      const docRef = createDocRef(mockApp, "test-doc-14" as DocumentId, testSchema);

      const unsubscribeState = service.onStateChange(docRef, () => {});

      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalledTimes(1);

      unsubscribeState();

      expect(mockEventService.stopDocumentSync).toHaveBeenCalledTimes(1);

      unsubscribes.push(service.onStateChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalledTimes(2);
    });

    it("should close data-owned metadata updates with the last data subscriber", async () => {
      mockEventService.subscribeToMetadataUpdates.mockResolvedValueOnce(
        "data-metadata-sub" as SubscriptionId,
      );
      const docRef = createDocRef(mockApp, "test-doc-data-metadata" as DocumentId, testSchema);

      const unsubscribeState = service.onStateChange(docRef, () => {});
      await vi.runAllTimersAsync();
      unsubscribeState();

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("data-metadata-sub");
    });

    it("should keep metadata updates while an explicit subscriber remains", async () => {
      mockEventService.subscribeToMetadataUpdates.mockResolvedValueOnce(
        "shared-metadata-sub" as SubscriptionId,
      );
      const docRef = createDocRef(mockApp, "test-doc-shared-metadata" as DocumentId, testSchema);

      const unsubscribeMetadata = service.onMetadataChange(docRef, () => {});
      const unsubscribeState = service.onStateChange(docRef, () => {});
      await vi.runAllTimersAsync();

      mockEventService.unsubscribe.mockClear();
      unsubscribeState();

      expect(mockEventService.stopDocumentSync).toHaveBeenCalled();
      expect(mockEventService.unsubscribe).not.toHaveBeenCalledWith("shared-metadata-sub");

      unsubscribeMetadata();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("shared-metadata-sub");
    });

    it("should retry metadata load after data-open metadata failure", async () => {
      vi.mocked(Documents.get).mockRejectedValueOnce(new Error("Metadata failed"));

      const docRef = createDocRef(mockApp, "test-doc-15" as DocumentId, testSchema);
      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      const unsubscribeState = service.onStateChange(docRef, () => {});

      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledTimes(1);
      expect(mockEventService.startDocumentSync).not.toHaveBeenCalled();
      expect(statusUpdates.at(-1)?.metadata.load).toBe(DocumentLoadStatus.ERROR);
      expect(statusUpdates.at(-1)?.data.load).toBe(DocumentLoadStatus.ERROR);

      unsubscribeState();

      unsubscribes.push(service.onStateChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledTimes(2);
      expect(mockEventService.startDocumentSync).toHaveBeenCalled();
      expect(statusUpdates.at(-1)?.metadata.load).toBe(DocumentLoadStatus.LOADED);
      expect(statusUpdates.at(-1)?.data.load).toBe(DocumentLoadStatus.LOADED);
    });

    it("should not start stale websocket data sync after document is recreated", async () => {
      let resolveMetadata: (document: Document) => void = () => {};
      vi.mocked(Documents.get).mockReturnValueOnce(
        new Promise<Document>(resolve => {
          resolveMetadata = resolve;
        }),
      );

      const docRef = createDocRef(mockApp, "test-doc-16" as DocumentId, testSchema);
      service.onStateChange(docRef, () => {});

      await service.deleteDocument(docRef);
      service.createDocRef(docRef.id, testSchema);

      resolveMetadata(mockDocument);
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).not.toHaveBeenCalled();
    });

    it("should dispose every active document channel after deletion", async () => {
      mockEventService.subscribeToMetadataUpdates.mockResolvedValueOnce(
        "delete-metadata-sub" as SubscriptionId,
      );
      mockEventService.subscribeToActivityUpdates.mockResolvedValueOnce(
        "delete-activity-sub" as SubscriptionId,
      );
      mockEventService.subscribeToPresenceUpdates.mockResolvedValueOnce(
        "delete-presence-sub" as SubscriptionId,
      );
      const docRef = createDocRef(mockApp, "test-doc-delete-active" as DocumentId, testSchema);

      service.onStateChange(docRef, () => {});
      service.onActivity(docRef, () => {});
      service.onPresence(docRef, () => {});
      await vi.runAllTimersAsync();

      await service.deleteDocument(docRef);

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("delete-metadata-sub");
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("delete-activity-sub");
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("delete-presence-sub");
      expect(mockEventService.disposeDocument).toHaveBeenCalledWith(docRef.id);
    });

    it("should handle websocket subscription errors and update data status to ERROR", async () => {
      mockEventService.startDocumentSync.mockImplementationOnce(
        (documentId, _yDoc, _clientSupportedVersionRange, onStatusChange) => {
          const session: SyncSession = {
            clientId: `test-client-${++sessionCounter}`,
            documentId,
          };

          void Promise.resolve().then(() => {
            onStatusChange({
              error: { code: ChannelErrorCode.UNKNOWN, errorInstanceId: "" },
              load: DocumentLoadStatus.ERROR,
            });
          });

          return session;
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-9" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      const finalStatus = statusUpdates.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.data.load).toBe(DocumentLoadStatus.ERROR);
      expect(finalStatus?.data.error).toBeDefined();
    });

    it("should handle error messages from websocket and update data status", async () => {
      mockEventService.startDocumentSync.mockImplementationOnce(
        (documentId, _yDoc, _clientSupportedVersionRange, onStatusChange) => {
          const session: SyncSession = {
            clientId: `test-client-${++sessionCounter}`,
            documentId,
          };

          void Promise.resolve().then(() => {
            onStatusChange({
              load: DocumentLoadStatus.LOADED,
            });
          }).then(() => {
            onStatusChange({
              error: { code: ChannelErrorCode.UNKNOWN, errorInstanceId: "" },
              load: DocumentLoadStatus.ERROR,
            });
          });

          return session;
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-10" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      const finalStatus = statusUpdates.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.data.load).toBe(DocumentLoadStatus.ERROR);
      expect(finalStatus?.data.error).toBeDefined();
    });

    it("should update data status to LOADED after successful websocket subscription", async () => {
      const docRef = createDocRef(mockApp, "test-doc-11" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      const statusAfterSubscribe = statusUpdates.at(-1);
      expect(statusAfterSubscribe).toBeDefined();
      expect(statusAfterSubscribe?.data.load).toBe(DocumentLoadStatus.LOADED);
      expect(statusAfterSubscribe?.data.error).toBeUndefined();
    });
  });

  describe("activity channel status", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should set activity status to ERROR on an in-band error event", async () => {
      let activityCallback: (event: ActivityCollaborativeUpdate) => void = () => {};
      mockEventService.subscribeToActivityUpdates.mockImplementationOnce(
        (_documentId, _range, callback) => {
          activityCallback = callback;
          return Promise.resolve("activity-sub-id" as SubscriptionId);
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-activity" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onActivity(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.LOADED);

      // Backend errors (e.g. CLIENT_VERSION_TOO_LOW) arrive in-band, but backpack
      // unsubscribes the channel alongside the error, so the status stays ERROR.
      activityCallback({
        type: "error",
        code: ChannelErrorCode.UNKNOWN,
        errorInstanceId: "",
      } as unknown as ActivityCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.ERROR);
      expect(statusUpdates.at(-1)?.activity.error).toBeDefined();
    });

    it("should reset activity status to UNLOADED on unsubscribe", async () => {
      mockEventService.subscribeToActivityUpdates.mockResolvedValueOnce(
        "activity-sub-id" as SubscriptionId,
      );

      const docRef = createDocRef(
        mockApp,
        "test-doc-activity-unsubscribe" as DocumentId,
        testSchema,
      );

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      const unsubscribeActivity = service.onActivity(docRef, () => {});
      await vi.runAllTimersAsync();

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.LOADED);

      unsubscribeActivity();

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.UNLOADED);
      expect(statusUpdates.at(-1)?.activity.error).toBeUndefined();
    });

    it("should share activity updates until the last subscriber leaves", async () => {
      let activityCallback: (event: ActivityCollaborativeUpdate) => void = () => {};
      mockEventService.subscribeToActivityUpdates.mockImplementationOnce(
        (_documentId, _range, callback) => {
          activityCallback = callback;
          return Promise.resolve("activity-sub-id" as SubscriptionId);
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-activity-shared" as DocumentId, testSchema);
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      const unsubscribeA = service.onActivity(docRef, callbackA);
      const unsubscribeB = service.onActivity(docRef, callbackB);
      await vi.runAllTimersAsync();

      expect(mockEventService.subscribeToActivityUpdates).toHaveBeenCalledTimes(1);

      const activityUpdate = {
        type: "activityCreated",
        activityEvent: {
          aggregationKey: "test-doc-activity-shared",
          createdBy: "other-user",
          createdTime: "2025-01-01T00:00:00Z",
          eventData: { type: "documentCreate", name: "Test Document" },
          eventId: "activity-event-1",
          isRead: false,
        },
      } as unknown as ActivityCollaborativeUpdate;
      activityCallback(activityUpdate);

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);

      unsubscribeA();
      expect(mockEventService.unsubscribe).not.toHaveBeenCalled();

      activityCallback(activityUpdate);
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(2);

      unsubscribeB();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("activity-sub-id");
    });

    it("should discard an activity subscription from an obsolete subscriber generation", async () => {
      let resolveFirst: (subscriptionId: SubscriptionId) => void = () => {};
      let resolveSecond: (subscriptionId: SubscriptionId) => void = () => {};
      const activityCallbacks: Array<(event: ActivityCollaborativeUpdate) => void> = [];
      mockEventService.subscribeToActivityUpdates
        .mockImplementationOnce((_documentId, _range, callback) => {
          activityCallbacks.push(callback);
          return new Promise(resolve => {
            resolveFirst = resolve;
          });
        })
        .mockImplementationOnce((_documentId, _range, callback) => {
          activityCallbacks.push(callback);
          return new Promise(resolve => {
            resolveSecond = resolve;
          });
        });

      const docRef = createDocRef(mockApp, "test-doc-activity-stale" as DocumentId, testSchema);
      const callback = vi.fn();
      const unsubscribeFirst = service.onActivity(docRef, callback);
      unsubscribeFirst();
      const unsubscribeSecond = service.onActivity(docRef, callback);

      resolveFirst("old-activity-sub-id" as SubscriptionId);
      await vi.runAllTimersAsync();

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("old-activity-sub-id");

      const activityUpdate = {
        type: "activityCreated",
        activityEvent: {
          aggregationKey: "test-doc-activity-stale",
          createdBy: "other-user",
          createdTime: "2025-01-01T00:00:00Z",
          eventData: { type: "documentCreate", name: "Test Document" },
          eventId: "activity-event-1",
          isRead: false,
        },
      } as unknown as ActivityCollaborativeUpdate;
      activityCallbacks[0]?.(activityUpdate);
      expect(callback).not.toHaveBeenCalled();

      resolveSecond("new-activity-sub-id" as SubscriptionId);
      await vi.runAllTimersAsync();
      activityCallbacks[1]?.(activityUpdate);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribeSecond();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("new-activity-sub-id");
    });
  });

  describe("presence channel status", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should set presence status to ERROR on an in-band error event", async () => {
      let presenceCallback: (update: PresenceCollaborativeUpdate) => void = () => {};
      mockEventService.subscribeToPresenceUpdates.mockImplementationOnce(
        (_documentId, _range, callback) => {
          presenceCallback = callback;
          return Promise.resolve("presence-sub-id" as SubscriptionId);
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-presence" as DocumentId, testSchema);

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      unsubscribes.push(service.onPresence(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.LOADED);

      // Backend errors (e.g. CLIENT_VERSION_TOO_LOW) arrive in-band, but backpack
      // unsubscribes the channel alongside the error, so the status stays ERROR.
      presenceCallback({
        type: "error",
        code: ChannelErrorCode.UNKNOWN,
        errorInstanceId: "",
      } as unknown as PresenceCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.ERROR);
      expect(statusUpdates.at(-1)?.presence.error).toBeDefined();
    });

    it("should reset presence status to UNLOADED on unsubscribe", async () => {
      mockEventService.subscribeToPresenceUpdates.mockResolvedValueOnce(
        "presence-sub-id" as SubscriptionId,
      );

      const docRef = createDocRef(
        mockApp,
        "test-doc-presence-unsubscribe" as DocumentId,
        testSchema,
      );

      const statusUpdates: DocumentStatus[] = [];
      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdates.push(status);
      }));

      const unsubscribePresence = service.onPresence(docRef, () => {});
      await vi.runAllTimersAsync();

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.LOADED);

      unsubscribePresence();

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.UNLOADED);
      expect(statusUpdates.at(-1)?.presence.error).toBeUndefined();
    });

    it("should share presence updates with per-subscriber self filtering", async () => {
      let presenceCallback: (update: PresenceCollaborativeUpdate) => void = () => {};
      mockEventService.subscribeToPresenceUpdates.mockImplementationOnce(
        (_documentId, _range, callback, options) => {
          presenceCallback = callback;
          expect(options?.ignoreSelfUpdates).toBe(false);
          return Promise.resolve("presence-sub-id" as SubscriptionId);
        },
      );

      const docRef = createDocRef(mockApp, "test-doc-presence-shared" as DocumentId, testSchema);
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      const unsubscribeA = service.onPresence(docRef, callbackA);
      const unsubscribeB = service.onPresence(docRef, callbackB, { ignoreSelfUpdates: false });
      await vi.runAllTimersAsync();

      expect(mockEventService.subscribeToPresenceUpdates).toHaveBeenCalledTimes(1);

      presenceCallback({
        type: "presenceChangeEvent",
        userId: "local-user",
        status: "PRESENT",
      } as unknown as PresenceCollaborativeUpdate);

      expect(callbackA).not.toHaveBeenCalled();
      expect(callbackB).toHaveBeenCalledTimes(1);

      unsubscribeA();
      expect(mockEventService.unsubscribe).not.toHaveBeenCalled();

      unsubscribeB();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("presence-sub-id");
    });

    it("should discard a presence subscription from an obsolete subscriber generation", async () => {
      let resolveFirst: (subscriptionId: SubscriptionId) => void = () => {};
      let resolveSecond: (subscriptionId: SubscriptionId) => void = () => {};
      const presenceCallbacks: Array<(update: PresenceCollaborativeUpdate) => void> = [];
      mockEventService.subscribeToPresenceUpdates
        .mockImplementationOnce((_documentId, _range, callback) => {
          presenceCallbacks.push(callback);
          return new Promise(resolve => {
            resolveFirst = resolve;
          });
        })
        .mockImplementationOnce((_documentId, _range, callback) => {
          presenceCallbacks.push(callback);
          return new Promise(resolve => {
            resolveSecond = resolve;
          });
        });

      const docRef = createDocRef(mockApp, "test-doc-presence-stale" as DocumentId, testSchema);
      const callback = vi.fn();
      const unsubscribeFirst = service.onPresence(docRef, callback);
      unsubscribeFirst();
      const unsubscribeSecond = service.onPresence(docRef, callback);

      resolveFirst("old-presence-sub-id" as SubscriptionId);
      await vi.runAllTimersAsync();

      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("old-presence-sub-id");

      const presenceUpdate = {
        type: "presenceChangeEvent",
        userId: "other-user",
        status: "PRESENT",
      } as unknown as PresenceCollaborativeUpdate;
      presenceCallbacks[0]?.(presenceUpdate);
      expect(callback).not.toHaveBeenCalled();

      resolveSecond("new-presence-sub-id" as SubscriptionId);
      await vi.runAllTimersAsync();
      presenceCallbacks[1]?.(presenceUpdate);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribeSecond();
      expect(mockEventService.unsubscribe).toHaveBeenCalledWith("new-presence-sub-id");
    });
  });

  describe("combined metadata and data loading", () => {
    const unsubscribes: Array<() => void> = [];

    afterEach(() => {
      unsubscribes.forEach(fn => {
        fn();
      });
      unsubscribes.length = 0;
    });

    it("should separate metadata and data loading", async () => {
      const docRef = createDocRef(mockApp, "test-doc-12" as DocumentId, testSchema);

      const statusUpdatesBeforeData: DocumentStatus[] = [];
      const statusUpdatesAfterData: DocumentStatus[] = [];

      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdatesAfterData.push(status);
      }));

      unsubscribes.push(service.onMetadataChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      unsubscribes.push(service.onStatusChange(docRef, (_, status) => {
        statusUpdatesBeforeData.push(status);
      }));

      unsubscribes.push(service.onStateChange(docRef, () => {}));

      await vi.runAllTimersAsync();

      expect(Documents.get).toHaveBeenCalledTimes(1);
      expect(mockEventService.startDocumentSync).toHaveBeenCalled();

      const finalStatus = statusUpdatesAfterData.at(-1);
      expect(finalStatus).toBeDefined();
      expect(finalStatus?.metadata.load).toBe(DocumentLoadStatus.LOADED);
      expect(finalStatus?.data.load).toBe(DocumentLoadStatus.LOADED);
    });
  });
});
