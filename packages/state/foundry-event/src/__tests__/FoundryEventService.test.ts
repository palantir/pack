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
  type DocumentSyncStatus,
} from "@palantir/pack.state.core";
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
});
