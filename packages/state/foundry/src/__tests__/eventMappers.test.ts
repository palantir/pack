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

import type { ActivityCollaborativeUpdate } from "@osdk/foundry.pack";
import type { DocumentSchema, Model } from "@palantir/pack.document-schema.model-types";
import { ActivityEventDataType, Metadata } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import { getActivityEvent } from "../eventMappers.js";

const mockModel = {
  __type: {} as { someField: string },
  zodSchema: {} as Model["zodSchema"],
  [Metadata]: { name: "TestModel" },
} as unknown as Model;

const emptySchema = {
  [Metadata]: { name: "TestSchema", version: 0, models: {} },
} as unknown as DocumentSchema;

const schemaWithModel = {
  ...emptySchema,
  TestModel: mockModel,
} as unknown as DocumentSchema;

function makeActivityUpdate(
  eventData: unknown,
): ActivityCollaborativeUpdate {
  return {
    type: "activityCreated",
    activityEvent: {
      eventId: "event-1",
      eventData,
      isRead: false,
      aggregationKey: "agg-1",
      createdBy: "user-1",
      createdTime: "2026-01-01T00:00:00Z",
    },
  } as ActivityCollaborativeUpdate;
}

describe("getActivityEvent", () => {
  it("returns undefined for activityDeleted events", () => {
    const update = {
      type: "activityDeleted",
      eventId: "event-1",
      aggregationKey: "agg-1",
    } as ActivityCollaborativeUpdate;

    expect(getActivityEvent(emptySchema, update)).toBeUndefined();
  });

  it("maps documentCreate events", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentCreate",
        name: "My Document",
        initialMandatorySecurity: {
          classification: ["SECRET"],
          markings: ["marking-1"],
        },
      }),
    );

    expect(result).toBeDefined();
    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_CREATE,
      name: "My Document",
      initialMandatorySecurity: {
        classification: ["SECRET"],
        markings: ["marking-1"],
      },
    });
  });

  it("maps documentCreate with missing fields to defaults", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentCreate",
        initialMandatorySecurity: undefined,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_CREATE,
      name: "",
      initialMandatorySecurity: {
        classification: undefined,
        markings: undefined,
      },
    });
  });

  it("maps documentRename events", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentRename",
        previousName: "Old Name",
        newName: "New Name",
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_RENAME,
      previousName: "Old Name",
      newName: "New Name",
    });
  });

  it("maps documentDescriptionUpdate events", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentDescriptionUpdate",
        newDescription: "Updated description",
        isInitial: false,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_DESCRIPTION_UPDATE,
      newDescription: "Updated description",
      isInitial: false,
    });
  });

  it("maps documentMandatorySecurityUpdate events", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentMandatorySecurityUpdate",
        newClassification: ["test-classification"],
        newMarkings: ["test-marking"],
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_MANDATORY_SECURITY_UPDATE,
      newClassification: ["test-classification"],
      newMarkings: ["test-marking"],
    });
  });

  it("maps documentDiscretionarySecurityUpdate events", () => {
    const newSecurity = {
      owners: [{ type: "all" as const }],
      editors: [],
      viewers: [],
    };
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentDiscretionarySecurityUpdate",
        principalType: "ALL_PRINCIPAL",
        previousDiscretionarySecurity: undefined,
        newDiscretionarySecurity: newSecurity,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.DOCUMENT_DISCRETIONARY_SECURITY_UPDATE,
      principalType: "ALL_PRINCIPAL",
      previousDiscretionarySecurity: undefined,
      newDiscretionarySecurity: newSecurity,
    });
  });

  it("maps documentCustomEvent with known model to CUSTOM_EVENT", () => {
    const customData = { eventType: "shapeAdd", nodeId: "node-1" };
    const result = getActivityEvent(
      schemaWithModel,
      makeActivityUpdate({
        type: "documentCustomEvent",
        eventType: "TestModel",
        data: customData,
        version: 1,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.CUSTOM_EVENT,
      model: mockModel,
      eventType: "TestModel",
      data: customData,
    });
  });

  it("maps documentCustomEvent with unknown model to UNKNOWN", () => {
    const customData = { eventType: "shapeAdd", nodeId: "node-1" };
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentCustomEvent",
        eventType: "NonExistentModel",
        data: customData,
        version: 1,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.UNKNOWN,
      rawType: "NonExistentModel",
      rawData: customData,
    });
  });

  it("maps unrecognized event types to UNKNOWN", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "someNewEventType",
        someData: 123,
      }),
    );

    expect(result!.eventData).toEqual({
      type: ActivityEventDataType.UNKNOWN,
      rawType: "someNewEventType",
      rawData: { type: "someNewEventType", someData: 123 },
    });
  });

  it("populates top-level event fields correctly", () => {
    const result = getActivityEvent(
      emptySchema,
      makeActivityUpdate({
        type: "documentCreate",
        name: "Test",
        initialMandatorySecurity: { classification: [], markings: [] },
      }),
    );

    expect(result).toMatchObject({
      eventId: "event-1",
      aggregationKey: "agg-1",
      createdBy: "user-1",
      isRead: false,
    });
    expect(result!.createdInstant).toEqual(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
  });
});
