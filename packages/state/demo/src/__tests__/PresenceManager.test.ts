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

import type {
  ActivityEvent,
  ActivityEventId,
  DocumentId,
  DocumentSchema,
  Model,
  PresenceEvent,
  UserId,
} from "@palantir/pack.document-schema.model-types";
import {
  ActivityEventDataType,
  Metadata,
  PresenceEventDataType,
} from "@palantir/pack.document-schema.model-types";
import { describe, expect, it, vi } from "vitest";
import { PresenceManager } from "../PresenceManager.js";

interface TestPayload {
  readonly id: string;
}

const TestModel = {
  __type: {} as TestPayload,
  [Metadata]: { name: "TestModel" },
  zodSchema: {},
} as unknown as Model<TestPayload>;

const schema = {
  [Metadata]: {
    version: 1,
  },
  TestModel,
} as const satisfies DocumentSchema;

function createDocumentId(): DocumentId {
  return `presence-manager-test-${Date.now()}-${Math.random()}` as DocumentId;
}

describe("PresenceManager custom payload mapping", () => {
  it("maps unsupported custom activity payload versions to UNKNOWN", async () => {
    const documentId = createDocumentId();
    const sender = new PresenceManager(documentId, "sender", schema);
    const receiver = new PresenceManager(documentId, "receiver", schema);
    const receivedEvents: ActivityEvent[] = [];

    try {
      receiver.onActivity(event => {
        receivedEvents.push(event);
      });

      sender.broadcastActivity({
        aggregationKey: "agg-1",
        createdBy: "sender" as UserId,
        createdInstant: 1,
        eventData: {
          data: { id: "payload-1" },
          eventType: "TestModel",
          model: TestModel,
          schemaVersion: 99,
          type: ActivityEventDataType.CUSTOM_EVENT,
        },
        eventId: "event-1" as ActivityEventId,
        isRead: false,
      });

      await vi.waitFor(() => {
        expect(
          receivedEvents.some(event =>
            event.eventData.type === ActivityEventDataType.UNKNOWN
            && event.eventData.rawType === "TestModel"
          ),
        ).toBe(true);
      });
    } finally {
      sender.dispose();
      receiver.dispose();
    }
  });

  it("maps unsupported custom presence payload versions to UNKNOWN", async () => {
    const documentId = createDocumentId();
    const sender = new PresenceManager(documentId, "sender", schema);
    const receiver = new PresenceManager(documentId, "receiver", schema);
    const receivedEvents: PresenceEvent[] = [];

    try {
      receiver.onPresence(event => {
        receivedEvents.push(event);
      });

      sender.broadcastPresence({
        eventData: {
          eventData: { id: "payload-1" },
          model: TestModel,
          schemaVersion: 99,
          type: PresenceEventDataType.CUSTOM_EVENT,
        },
        userId: "sender" as UserId,
      });

      await vi.waitFor(() => {
        expect(
          receivedEvents.some(event =>
            event.eventData.type === PresenceEventDataType.UNKNOWN
            && event.eventData.rawType === "TestModel"
          ),
        ).toBe(true);
      });
    } finally {
      sender.dispose();
      receiver.dispose();
    }
  });
});
