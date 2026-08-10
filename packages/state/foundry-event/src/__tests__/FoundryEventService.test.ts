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

import type { DocumentUpdateMessage } from "@osdk/foundry.pack";
import type { PackAppInternal } from "@palantir/pack.core";
import type { DocumentId } from "@palantir/pack.document-schema.model-types";
import {
  addDocumentUpdateSchemaVersionToTransaction,
  DocumentLiveStatus,
  DocumentLoadStatus,
  type DocumentSyncStatus,
} from "@palantir/pack.state.core";
import { Base64 } from "js-base64";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createFoundryEventService } from "../FoundryEventService.js";
import type { SubscriptionId } from "../types/EventService.js";

interface PublishedDocumentUpdate {
  readonly documentUpdateSchemaVersion?: number;
  readonly yjsUpdate?: {
    readonly data?: unknown;
  };
}

const mocks = vi.hoisted(() => {
  const eventService = {
    publish: vi.fn(),
    setLogLevel: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  return { eventService };
});

vi.mock("../cometd/EventServiceCometD.js", () => ({
  EventServiceCometD: vi.fn(function() {
    return mocks.eventService;
  }),
}));

const logger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
logger.child.mockReturnValue(logger);

const app = {
  config: {
    logger,
  },
} as unknown as PackAppInternal;

describe("FoundryEventService", () => {
  beforeEach(() => {
    mocks.eventService.publish.mockReset();
    mocks.eventService.publish.mockResolvedValue(undefined);
    mocks.eventService.subscribe.mockReset();
    mocks.eventService.unsubscribe.mockReset();
  });

  it("publishes documentUpdateSchemaVersion for local Yjs updates", async () => {
    let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
    mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
      updateCallback = callback as (message: DocumentUpdateMessage) => void;
      return Promise.resolve("sub-1" as SubscriptionId);
    });

    const yDoc = new Y.Doc();
    const service = createFoundryEventService(app);
    const statusUpdates: Array<Partial<DocumentSyncStatus>> = [];

    service.startDocumentSync(
      "doc-1" as DocumentId,
      yDoc,
      { maxVersion: 2, minVersion: 1 },
      status => statusUpdates.push(status),
    );

    await Promise.resolve();
    updateCallback?.({
      baseRevisionId: "0",
      clientId: "server",
      clientSupportedVersionRange: { minVersion: 1, maxVersion: 1 },
      editIds: [],
      revisionId: "1",
      type: "update",
    });

    yDoc.transact(transaction => {
      addDocumentUpdateSchemaVersionToTransaction(transaction, 2);
      yDoc.getMap("Shape").set("shape-1", new Y.Map());
    });

    expect(mocks.eventService.publish).toHaveBeenCalledWith(
      "/document/doc-1/publish",
      expect.any(Object),
    );
    const publishCall = mocks.eventService.publish.mock.calls[0] as
      | [unknown, PublishedDocumentUpdate]
      | undefined;
    expect(publishCall?.[1].documentUpdateSchemaVersion).toBe(2);
    expect(typeof publishCall?.[1].yjsUpdate?.data).toBe("string");
    expect(statusUpdates.at(-1)?.error).toBeUndefined();
  });

  it("uses the document operational version when a local Yjs update has no version metadata", async () => {
    let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
    mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
      updateCallback = callback as (message: DocumentUpdateMessage) => void;
      return Promise.resolve("sub-1" as SubscriptionId);
    });

    const yDoc = new Y.Doc();
    const service = createFoundryEventService(app);

    service.startDocumentSync(
      "doc-1" as DocumentId,
      yDoc,
      { maxVersion: 3, minVersion: 1 },
      () => {},
      () => 2,
    );

    await Promise.resolve();
    updateCallback?.({
      baseRevisionId: "0",
      clientId: "server",
      clientSupportedVersionRange: { minVersion: 1, maxVersion: 1 },
      editIds: [],
      revisionId: "1",
      type: "update",
    });

    yDoc.getMap("Shape").set("shape-1", new Y.Map());

    const publishCall = mocks.eventService.publish.mock.calls[0] as
      | [unknown, PublishedDocumentUpdate]
      | undefined;
    expect(publishCall?.[1].documentUpdateSchemaVersion).toBe(2);
  });

  it("preserves a calculated update schema version below the document operational version", async () => {
    let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
    mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
      updateCallback = callback as (message: DocumentUpdateMessage) => void;
      return Promise.resolve("sub-1" as SubscriptionId);
    });

    const yDoc = new Y.Doc();
    const service = createFoundryEventService(app);

    service.startDocumentSync(
      "doc-1" as DocumentId,
      yDoc,
      { maxVersion: 3, minVersion: 1 },
      () => {},
      () => 2,
    );

    await Promise.resolve();
    updateCallback?.({
      baseRevisionId: "0",
      clientId: "server",
      clientSupportedVersionRange: { minVersion: 1, maxVersion: 1 },
      editIds: [],
      revisionId: "1",
      type: "update",
    });

    yDoc.transact(transaction => {
      addDocumentUpdateSchemaVersionToTransaction(transaction, 1);
      yDoc.getMap("Shape").set("shape-1", new Y.Map());
    });

    const publishCall = mocks.eventService.publish.mock.calls[0] as
      | [unknown, PublishedDocumentUpdate]
      | undefined;
    expect(publishCall?.[1].documentUpdateSchemaVersion).toBe(1);
  });

  it("keeps activity subscriptions independent from document data sync", async () => {
    mocks.eventService.subscribe
      .mockResolvedValueOnce("activity-sub" as SubscriptionId)
      .mockResolvedValueOnce("document-sub" as SubscriptionId);

    const service = createFoundryEventService(app);
    const activitySubscriptionId = await service.subscribeToActivityUpdates(
      "doc-1" as DocumentId,
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    const session = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();

    service.stopDocumentSync(session);

    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("document-sub");
    expect(mocks.eventService.unsubscribe).not.toHaveBeenCalledWith("activity-sub");

    service.unsubscribe(activitySubscriptionId);
    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("activity-sub");
  });

  it("keeps presence subscriptions independent from document data sync", async () => {
    mocks.eventService.subscribe
      .mockResolvedValueOnce("presence-sub" as SubscriptionId)
      .mockResolvedValueOnce("document-sub" as SubscriptionId);

    const service = createFoundryEventService(app);
    const presenceSubscriptionId = await service.subscribeToPresenceUpdates(
      "doc-1" as DocumentId,
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    const session = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();

    service.stopDocumentSync(session);

    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("document-sub");
    expect(mocks.eventService.unsubscribe).not.toHaveBeenCalledWith("presence-sub");

    service.unsubscribe(presenceSubscriptionId);
    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("presence-sub");
  });

  it("keeps metadata subscriptions independent from document data sync", async () => {
    mocks.eventService.subscribe
      .mockResolvedValueOnce("metadata-sub" as SubscriptionId)
      .mockResolvedValueOnce("document-sub" as SubscriptionId);

    const service = createFoundryEventService(app);
    const metadataSubscriptionId = await service.subscribeToMetadataUpdates(
      "doc-1" as DocumentId,
      () => {},
    );
    const session = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();

    service.stopDocumentSync(session);

    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("document-sub");
    expect(mocks.eventService.unsubscribe).not.toHaveBeenCalledWith("metadata-sub");

    service.unsubscribe(metadataSubscriptionId);
    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("metadata-sub");
  });

  it("keeps the document client id stable when data sync restarts", async () => {
    mocks.eventService.subscribe
      .mockResolvedValueOnce("document-sub-1" as SubscriptionId)
      .mockResolvedValueOnce("document-sub-2" as SubscriptionId);

    const service = createFoundryEventService(app);
    const firstSession = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();
    service.stopDocumentSync(firstSession);

    const secondSession = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );

    expect(secondSession.clientId).toBe(firstSession.clientId);
  });

  it("does not replace the active Y.Doc when a duplicate data sync is rejected", async () => {
    mocks.eventService.subscribe.mockResolvedValueOnce("document-sub" as SubscriptionId);
    const service = createFoundryEventService(app);
    const activeYDoc = new Y.Doc();
    const rejectedYDoc = new Y.Doc();
    const activeOff = vi.spyOn(activeYDoc, "off");
    const rejectedOff = vi.spyOn(rejectedYDoc, "off");

    const session = service.startDocumentSync(
      "doc-1" as DocumentId,
      activeYDoc,
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();

    expect(() =>
      service.startDocumentSync(
        "doc-1" as DocumentId,
        rejectedYDoc,
        { maxVersion: 1, minVersion: 1 },
        () => {},
      )
    ).toThrow("Document data sync already active");

    service.stopDocumentSync(session);

    expect(activeOff).toHaveBeenCalledWith("update", expect.any(Function));
    expect(rejectedOff).not.toHaveBeenCalled();
    expect(mocks.eventService.subscribe).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate data sync while the first subscription is still opening", async () => {
    let resolveSubscription: (subscriptionId: SubscriptionId) => void = () => {};
    mocks.eventService.subscribe.mockReturnValueOnce(
      new Promise(resolve => {
        resolveSubscription = resolve;
      }),
    );
    const service = createFoundryEventService(app);
    const session = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );

    expect(() =>
      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        () => {},
      )
    ).toThrow("Document data sync already active");
    expect(mocks.eventService.subscribe).toHaveBeenCalledTimes(1);

    service.stopDocumentSync(session);
    resolveSubscription("stale-document-sub" as SubscriptionId);
    await Promise.resolve();

    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("stale-document-sub");
  });

  it("disposes a document session and its active data subscription", async () => {
    mocks.eventService.subscribe
      .mockResolvedValueOnce("document-sub-1" as SubscriptionId)
      .mockResolvedValueOnce("document-sub-2" as SubscriptionId);

    const service = createFoundryEventService(app);
    const firstSession = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );
    await Promise.resolve();

    service.disposeDocument("doc-1" as DocumentId);

    expect(mocks.eventService.unsubscribe).toHaveBeenCalledWith("document-sub-1");

    const secondSession = service.startDocumentSync(
      "doc-1" as DocumentId,
      new Y.Doc(),
      { maxVersion: 1, minVersion: 1 },
      () => {},
    );

    expect(secondSession.clientId).not.toBe(firstSession.clientId);
  });

  describe("updates made before the initial revision is known", () => {
    /** Server acknowledgement that establishes lastRevisionId and completes the initial load. */
    function initialRevision(): DocumentUpdateMessage {
      return {
        baseRevisionId: "0",
        clientId: "server",
        clientSupportedVersionRange: { maxVersion: 1, minVersion: 1 },
        editIds: [],
        revisionId: "1",
        type: "update",
      };
    }

    /** Rebuild what a peer would see from every update this client published, in order. */
    function applyPublishedUpdates(): Y.Doc {
      const peerDoc = new Y.Doc();
      for (const call of mocks.eventService.publish.mock.calls) {
        const message = call[1] as PublishedDocumentUpdate;
        const data = message.yjsUpdate?.data;
        if (typeof data === "string") {
          Y.applyUpdate(peerDoc, Base64.toUint8Array(data));
        }
      }
      return peerDoc;
    }

    /**
     * Keys a peer would observe after each published update, in publish order. The merged end
     * state cannot distinguish flush order — Yjs buffers an update whose dependencies have not
     * arrived and integrates it later — so only the intermediate states pin FIFO.
     */
    function publishedKeySnapshots(): string[][] {
      const peerDoc = new Y.Doc();
      const snapshots: string[][] = [];
      for (const call of mocks.eventService.publish.mock.calls) {
        const message = call[1] as PublishedDocumentUpdate;
        const data = message.yjsUpdate?.data;
        if (typeof data === "string") {
          Y.applyUpdate(peerDoc, Base64.toUint8Array(data));
        }
        snapshots.push([...peerDoc.getMap("Shape").keys()].sort());
      }
      return snapshots;
    }

    function startSyncCapturingServer(yDoc: Y.Doc): {
      service: ReturnType<typeof createFoundryEventService>;
      deliverInitialRevision: () => void;
    } {
      let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
      mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
        updateCallback = callback as (message: DocumentUpdateMessage) => void;
        return Promise.resolve("sub-1" as SubscriptionId);
      });

      const service = createFoundryEventService(app);
      service.startDocumentSync(
        "doc-1" as DocumentId,
        yDoc,
        { maxVersion: 1, minVersion: 1 },
        () => {},
      );

      return { service, deliverInitialRevision: () => updateCallback?.(initialRevision()) };
    }

    it("holds a write made during the load instead of dropping it", async () => {
      const yDoc = new Y.Doc();
      const { deliverInitialRevision } = startSyncCapturingServer(yDoc);
      await Promise.resolve();

      // The handler is attached but lastRevisionId is still unknown. This previously logged
      // "Cannot publish document update before initial load is complete" and discarded the update.
      yDoc.getMap("Shape").set("shape-1", "during-load");
      expect(mocks.eventService.publish).not.toHaveBeenCalled();

      deliverInitialRevision();

      expect(mocks.eventService.publish).toHaveBeenCalledTimes(1);
      expect(applyPublishedUpdates().getMap("Shape").get("shape-1")).toBe("during-load");
    });

    it("preserves the order of writes held across the load", async () => {
      const yDoc = new Y.Doc();
      const { deliverInitialRevision } = startSyncCapturingServer(yDoc);
      await Promise.resolve();

      yDoc.getMap("Shape").set("first", "during-load");
      yDoc.getMap("Shape").set("second", "also-during-load");
      deliverInitialRevision();
      yDoc.getMap("Shape").set("third", "after-load");

      expect(mocks.eventService.publish).toHaveBeenCalledTimes(3);
      // Asserted per-update rather than on the merged result: applying all three into one doc
      // passes just as well for a reversed flush, so it would not test order at all.
      expect(publishedKeySnapshots()).toEqual([
        ["first"],
        ["first", "second"],
        ["first", "second", "third"],
      ]);
    });

    it("publishes nothing when no local write was made during the load", async () => {
      const yDoc = new Y.Doc();
      const { deliverInitialRevision } = startSyncCapturingServer(yDoc);
      await Promise.resolve();

      deliverInitialRevision();

      expect(mocks.eventService.publish).not.toHaveBeenCalled();
    });

    it("warns rather than staying silent when a load never completes", async () => {
      const yDoc = new Y.Doc();
      const { service } = startSyncCapturingServer(yDoc);
      await Promise.resolve();

      yDoc.getMap("Shape").set("shape-1", "never-published");
      logger.warn.mockClear();

      // The load never established a revision, so the held update has nothing to publish against
      // and is dropped. It must not be dropped quietly.
      service.stopDocumentSync({ clientId: "unused", documentId: "doc-1" as DocumentId });

      expect(mocks.eventService.publish).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Discarding local document updates"),
        expect.objectContaining({ discardedCount: 1 }),
      );
    });
  });

  describe("data channel liveness", () => {
    function collectStatus(): {
      statusUpdates: Array<Partial<DocumentSyncStatus>>;
      onStatusChange: (status: Partial<DocumentSyncStatus>) => void;
    } {
      const statusUpdates: Array<Partial<DocumentSyncStatus>> = [];
      return { statusUpdates, onStatusChange: status => statusUpdates.push(status) };
    }

    /** Latest reported value of a single status field, since updates are partial. */
    function latest<K extends keyof DocumentSyncStatus>(
      statusUpdates: Array<Partial<DocumentSyncStatus>>,
      field: K,
    ): DocumentSyncStatus[K] | undefined {
      return statusUpdates.filter(s => s[field] !== undefined).at(-1)?.[field];
    }

    it("reports CONNECTING while the subscription is being established", () => {
      mocks.eventService.subscribe.mockReturnValue(new Promise(() => {}));
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );

      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.CONNECTING);
      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.LOADING);
    });

    it("reports CONNECTED once the subscription is established", async () => {
      mocks.eventService.subscribe.mockResolvedValue("document-sub" as SubscriptionId);
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );
      await Promise.resolve();

      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.CONNECTED);
      // Liveness is independent of the load: no update has arrived yet.
      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.LOADING);
    });

    it("stays CONNECTED after the document finishes loading", async () => {
      let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
      mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
        updateCallback = callback as (message: DocumentUpdateMessage) => void;
        return Promise.resolve("document-sub" as SubscriptionId);
      });
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );
      await Promise.resolve();
      updateCallback?.({
        baseRevisionId: "0",
        clientId: "server",
        clientSupportedVersionRange: { maxVersion: 1, minVersion: 1 },
        editIds: [],
        revisionId: "1",
        type: "update",
      });

      // The reported regression: data synced correctly while live read DISCONNECTED forever.
      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.LOADED);
      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.CONNECTED);
    });

    it("reports ERROR when the subscription cannot be established", async () => {
      mocks.eventService.subscribe.mockRejectedValue(new Error("no socket"));
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );
      await Promise.resolve();
      await Promise.resolve();

      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.ERROR);
      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.ERROR);
    });

    it("leaves liveness alone when a revision gap makes local state stale", async () => {
      let updateCallback: ((message: DocumentUpdateMessage) => void) | undefined;
      mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
        updateCallback = callback as (message: DocumentUpdateMessage) => void;
        return Promise.resolve("document-sub" as SubscriptionId);
      });
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );
      await Promise.resolve();
      const update = (baseRevisionId: string, revisionId: string): DocumentUpdateMessage => ({
        baseRevisionId,
        clientId: "server",
        clientSupportedVersionRange: { maxVersion: 1, minVersion: 1 },
        editIds: [],
        revisionId,
        type: "update",
      });
      updateCallback?.(update("0", "1"));
      // Skips revision 2, so the local state is stale even though the socket is fine.
      updateCallback?.(update("7", "8"));

      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.ERROR);
      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.CONNECTED);
    });

    it("does not promote to CONNECTED when a channel error arrives with the subscribe ack", async () => {
      // CometD dispatches every message in one transport response synchronously, but the
      // subscribe promise's continuation is a microtask. A channel error delivered in the same
      // batch as the ack therefore always lands before the promotion runs.
      mocks.eventService.subscribe.mockImplementation((_channel, callback) => {
        const subscribed = Promise.resolve("document-sub" as SubscriptionId);
        (callback as (message: DocumentUpdateMessage) => void)({
          code: "REVISION_TOO_OLD",
          errorInstanceId: "error-instance-1",
          type: "error",
        } as unknown as DocumentUpdateMessage);
        return subscribed;
      });
      const service = createFoundryEventService(app);
      const { statusUpdates, onStatusChange } = collectStatus();

      service.startDocumentSync(
        "doc-1" as DocumentId,
        new Y.Doc(),
        { maxVersion: 1, minVersion: 1 },
        onStatusChange,
      );
      await Promise.resolve();

      expect(latest(statusUpdates, "live")).toBe(DocumentLiveStatus.ERROR);
      expect(latest(statusUpdates, "load")).toBe(DocumentLoadStatus.ERROR);
    });
  });
});
