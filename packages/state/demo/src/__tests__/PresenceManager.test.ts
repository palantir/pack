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
  DocumentId,
  DocumentSchema,
  Model,
  PresenceEvent,
  UserId,
} from "@palantir/pack.document-schema.model-types";
import {
  getMetadata,
  Metadata,
  PresenceEventDataType,
} from "@palantir/pack.document-schema.model-types";
import { describe, expect, it, vi } from "vitest";
import { PresenceManager } from "../PresenceManager.js";

const mockModel = {
  __type: {} as {
    fillColor?: string;
    someField: string;
  },
  zodSchema: {} as Model["zodSchema"],
  [Metadata]: { name: "TestModel" },
} as unknown as Model;

const schemaWithUpgradedModel = {
  TestModel: mockModel,
  [Metadata]: {
    minSupportedVersion: 1,
    name: "TestSchema",
    upgradeFns: {
      TestModel: {
        v2: {
          fillColor: () => "black",
        },
      },
    },
    upgrades: {
      TestModel: {
        allFields: {
          fillColor: { type: { kind: "primitive" } },
          someField: { type: { kind: "primitive" } },
        },
        modelName: "TestModel",
        steps: [
          {
            addedInVersion: 2,
            fields: {
              fillColor: {
                derivedFrom: [],
              },
            },
          },
        ],
      },
    },
    version: 2,
  },
} as unknown as DocumentSchema;

const shapeSnapshotModel = {
  __type: {} as {
    color?: string;
    fillColor?: string;
    nodeId: string;
    strokeColor?: string;
  },
  zodSchema: {} as Model["zodSchema"],
  [Metadata]: { name: "ShapeSnapshot" },
} as unknown as Model;

const shapeUpdatePresenceModel = {
  __type: {} as {
    activityType: "shapeUpdated";
    newShape: typeof shapeSnapshotModel.__type;
    nodeId: string;
    oldShape: typeof shapeSnapshotModel.__type;
  },
  zodSchema: {} as Model["zodSchema"],
  [Metadata]: { name: "ShapeUpdatePresence" },
} as unknown as Model;

const schemaWithNestedLensedPresence = {
  ShapeSnapshot: shapeSnapshotModel,
  ShapeUpdatePresence: shapeUpdatePresenceModel,
  [Metadata]: {
    minSupportedVersion: 1,
    name: "TestSchema",
    upgradeFns: {
      ShapeSnapshot: {
        v2: {
          fillColor: ({ color }: { readonly color: unknown }) => color,
          strokeColor: ({ color }: { readonly color: unknown }) => color,
        },
      },
    },
    upgrades: {
      ShapeSnapshot: {
        allFields: {
          color: { type: { kind: "primitive" } },
          fillColor: { type: { kind: "primitive" } },
          nodeId: { type: { kind: "primitive" } },
          strokeColor: { type: { kind: "primitive" } },
        },
        modelName: "ShapeSnapshot",
        steps: [
          {
            addedInVersion: 2,
            fields: {
              fillColor: {
                derivedFrom: ["color"],
              },
              strokeColor: {
                derivedFrom: ["color"],
              },
            },
          },
        ],
      },
      ShapeUpdatePresence: {
        allFields: {
          activityType: { type: { kind: "primitive" } },
          newShape: { type: { kind: "modelRef", model: "ShapeSnapshot" } },
          nodeId: { type: { kind: "primitive" } },
          oldShape: { type: { kind: "modelRef", model: "ShapeSnapshot" } },
        },
        modelName: "ShapeUpdatePresence",
        steps: [],
      },
    },
    version: 2,
  },
} as unknown as DocumentSchema;

function createDocumentId(): DocumentId {
  return `presence-manager-${Date.now()}-${Math.random()}` as DocumentId;
}

describe("PresenceManager custom presence lensing", () => {
  it("lenses live custom presence payloads from older schema versions", async () => {
    const documentId = createDocumentId();
    const sender = new PresenceManager(documentId, "sender", schemaWithUpgradedModel);
    const receiver = new PresenceManager(documentId, "receiver", schemaWithUpgradedModel);
    const receivedEvents: PresenceEvent[] = [];

    try {
      receiver.onPresence(event => {
        receivedEvents.push(event);
      });

      sender.broadcastPresence({
        eventData: {
          eventData: {
            someField: "node-1",
          },
          model: mockModel,
          schemaVersion: 1,
          type: PresenceEventDataType.CUSTOM_EVENT,
        },
        userId: "sender" as UserId,
      });

      await vi.waitFor(() => {
        const customEvent = receivedEvents.find(event =>
          event.eventData.type === PresenceEventDataType.CUSTOM_EVENT
          && getMetadata(event.eventData.model).name === "TestModel"
        );
        expect(customEvent).toBeDefined();
        if (customEvent?.eventData.type !== PresenceEventDataType.CUSTOM_EVENT) {
          throw new Error("Expected custom presence event");
        }
        expect(customEvent.eventData.schemaVersion).toBe(1);
        expect(customEvent.eventData.eventData).toEqual({
          fillColor: "black",
          someField: "node-1",
        });
      });
    } finally {
      sender.dispose();
      receiver.dispose();
    }
  });

  it("lenses nested model refs in live custom presence payloads", async () => {
    const documentId = createDocumentId();
    const sender = new PresenceManager(documentId, "sender", schemaWithNestedLensedPresence);
    const receiver = new PresenceManager(documentId, "receiver", schemaWithNestedLensedPresence);
    const receivedEvents: PresenceEvent[] = [];

    try {
      receiver.onPresence(event => {
        receivedEvents.push(event);
      });

      sender.broadcastPresence({
        eventData: {
          eventData: {
            activityType: "shapeUpdated",
            nodeId: "shape-1",
            oldShape: {
              color: "blue",
              nodeId: "shape-1",
            },
            newShape: {
              color: "red",
              nodeId: "shape-1",
            },
          },
          model: shapeUpdatePresenceModel,
          schemaVersion: 1,
          type: PresenceEventDataType.CUSTOM_EVENT,
        },
        userId: "sender" as UserId,
      });

      await vi.waitFor(() => {
        const customEvent = receivedEvents.find(event =>
          event.eventData.type === PresenceEventDataType.CUSTOM_EVENT
          && getMetadata(event.eventData.model).name === "ShapeUpdatePresence"
        );
        expect(customEvent).toBeDefined();
        if (customEvent?.eventData.type !== PresenceEventDataType.CUSTOM_EVENT) {
          throw new Error("Expected custom presence event");
        }
        expect(customEvent.eventData.schemaVersion).toBe(1);
        expect(customEvent.eventData.eventData).toEqual({
          activityType: "shapeUpdated",
          nodeId: "shape-1",
          oldShape: {
            color: "blue",
            fillColor: "blue",
            nodeId: "shape-1",
            strokeColor: "blue",
          },
          newShape: {
            color: "red",
            fillColor: "red",
            nodeId: "shape-1",
            strokeColor: "red",
          },
        });
      });
    } finally {
      sender.dispose();
      receiver.dispose();
    }
  });
});
