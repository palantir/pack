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
      const docRef = createDocRef(mockApp, "test-doc-13" as DocumentId, testSchema);

      const unsubscribeState = service.onStateChange(docRef, () => {});

      unsubscribeState();

      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).not.toHaveBeenCalled();
      expect(mockEventService.stopDocumentSync).not.toHaveBeenCalled();

      unsubscribes.push(service.onStateChange(docRef, () => {}));
      await vi.runAllTimersAsync();

      expect(mockEventService.startDocumentSync).toHaveBeenCalled();
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

    it("should error then self-heal activity status when a valid event follows an error", async () => {
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

      activityCallback({
        type: "error",
        code: ChannelErrorCode.UNKNOWN,
        errorInstanceId: "",
      } as unknown as ActivityCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.ERROR);
      expect(statusUpdates.at(-1)?.activity.error).toBeDefined();

      activityCallback({
        type: "activityCreated",
        activityEvent: {
          eventId: "event-1",
          eventData: { type: "unknownType" },
          isRead: false,
          aggregationKey: "agg-1",
          createdBy: "user-1",
          createdTime: "2026-01-01T00:00:00Z",
        },
      } as unknown as ActivityCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.activity.load).toBe(DocumentLoadStatus.LOADED);
      expect(statusUpdates.at(-1)?.activity.error).toBeUndefined();
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

    it("should error then self-heal presence status when a valid event follows an error", async () => {
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

      presenceCallback({
        type: "error",
        code: ChannelErrorCode.UNKNOWN,
        errorInstanceId: "",
      } as unknown as PresenceCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.ERROR);
      expect(statusUpdates.at(-1)?.presence.error).toBeDefined();

      presenceCallback({
        type: "presenceChangeEvent",
        userId: "other-user",
      } as unknown as PresenceCollaborativeUpdate);

      expect(statusUpdates.at(-1)?.presence.load).toBe(DocumentLoadStatus.LOADED);
      expect(statusUpdates.at(-1)?.presence.error).toBeUndefined();
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
