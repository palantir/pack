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
  ActivityEvent as FoundryActivityEvent,
  PresenceCollaborativeUpdate,
} from "@osdk/foundry.pack";
import { invalidUserRef } from "@palantir/pack.auth";
import type {
  ActivityEvent,
  ActivityEventData,
  ActivityEventDataDocumentCreate,
  ActivityEventDataDocumentDescriptionUpdate,
  ActivityEventDataDocumentDiscretionarySecurityUpdate,
  ActivityEventDataDocumentMandatorySecurityUpdate,
  ActivityEventDataDocumentRename,
  DocumentSchema,
  PresenceEvent,
  PresenceEventData,
  PresenceEventDataArrived,
  PresenceEventDataDeparted,
  UserId,
} from "@palantir/pack.document-schema.model-types";
import {
  ActivityEventDataType,
  PresenceEventDataType,
} from "@palantir/pack.document-schema.model-types";
import { readCustomPayload } from "@palantir/pack.state.core";

export function getActivityEvent(
  documentSchema: DocumentSchema,
  foundryEvent: ActivityCollaborativeUpdate,
): ActivityEvent | undefined {
  // TODO: need to handle deletes and ensure exhaustive handling
  if (foundryEvent.type !== "activityCreated") {
    return undefined;
  }
  const { activityEvent } = foundryEvent;
  const eventData = getActivityEventData(documentSchema, activityEvent);

  return {
    aggregationKey: activityEvent.aggregationKey,
    createdBy: activityEvent.createdBy as UserId,
    createdInstant: new Date(activityEvent.createdTime).getTime(),
    eventData,
    eventId: activityEvent.eventId,
    isRead: activityEvent.isRead,
  };
}

function getActivityEventData(
  docSchema: DocumentSchema,
  { eventData }: FoundryActivityEvent,
): ActivityEventData {
  switch (eventData.type) {
    case "documentCreate":
      return {
        initialMandatorySecurity: {
          classification: eventData.initialMandatorySecurity?.classification,
          markings: eventData.initialMandatorySecurity?.markings,
        },
        name: eventData.name ?? "",
        type: ActivityEventDataType.DOCUMENT_CREATE,
      } satisfies ActivityEventDataDocumentCreate;

    case "documentRename":
      return {
        newName: eventData.newName ?? "",
        previousName: eventData.previousName ?? "",
        type: ActivityEventDataType.DOCUMENT_RENAME,
      } satisfies ActivityEventDataDocumentRename;

    case "documentDescriptionUpdate":
      return {
        isInitial: eventData.isInitial ?? false,
        newDescription: eventData.newDescription ?? "",
        type: ActivityEventDataType.DOCUMENT_DESCRIPTION_UPDATE,
      } satisfies ActivityEventDataDocumentDescriptionUpdate;

    case "documentMandatorySecurityUpdate":
      return {
        newClassification: eventData.newClassification ?? [],
        newMarkings: eventData.newMarkings ?? [],
        type: ActivityEventDataType.DOCUMENT_MANDATORY_SECURITY_UPDATE,
      } satisfies ActivityEventDataDocumentMandatorySecurityUpdate;

    case "documentDiscretionarySecurityUpdate":
      return {
        principalType: eventData.principalType ?? "",
        previousDiscretionarySecurity: eventData.previousDiscretionarySecurity,
        newDiscretionarySecurity: eventData.newDiscretionarySecurity ?? [],
        type: ActivityEventDataType.DOCUMENT_DISCRETIONARY_SECURITY_UPDATE,
      } satisfies ActivityEventDataDocumentDiscretionarySecurityUpdate;

    case "documentCustomEvent": {
      const { eventType, data } = eventData;
      const customPayload = readCustomPayload({
        data,
        docSchema,
        modelName: eventType,
        schemaVersion: eventData.schemaVersion,
      });
      if (customPayload.type !== "readable") {
        return {
          rawData: data,
          rawType: eventType,
          type: ActivityEventDataType.UNKNOWN,
        };
      }

      return {
        data: customPayload.data,
        eventType,
        model: customPayload.model,
        schemaVersion: customPayload.schemaVersion,
        type: ActivityEventDataType.CUSTOM_EVENT,
      };
    }

    default: {
      const unknownEventData = eventData as Record<string, unknown>;
      return {
        rawData: eventData,
        rawType: typeof unknownEventData.type === "string" ? unknownEventData.type : "unknown",
        type: ActivityEventDataType.UNKNOWN,
      };
    }
  }
}

const ARRIVED_DATA: PresenceEventDataArrived = {
  type: PresenceEventDataType.ARRIVED,
} as const;

const DEPARTED_DATA: PresenceEventDataDeparted = {
  type: PresenceEventDataType.DEPARTED,
} as const;

export function getPresenceEvent(
  documentSchema: DocumentSchema,
  foundryUpdate: PresenceCollaborativeUpdate,
): PresenceEvent | undefined {
  switch (foundryUpdate.type) {
    case "presenceChangeEvent": {
      const { userId, status } = foundryUpdate;
      const eventData = status === "PRESENT" ? ARRIVED_DATA : DEPARTED_DATA;
      return {
        eventData,
        userId: userId as UserId,
      };
    }

    case "customPresenceEvent": {
      const { userId, eventData, eventType, schemaVersion } = foundryUpdate;
      const presenceEventData = getPresenceEventData(
        documentSchema,
        eventType,
        eventData,
        schemaVersion,
      );
      return {
        eventData: presenceEventData,
        userId: userId as UserId,
      };
    }
    case "error":
      // TODO: Handle error
      return undefined;
    default: {
      foundryUpdate satisfies never;
      const unknownUpdate = foundryUpdate as Record<string, unknown>;
      return {
        eventData: {
          rawData: foundryUpdate,
          rawType: typeof unknownUpdate.type === "string" ? unknownUpdate.type : "unknown",
          type: PresenceEventDataType.UNKNOWN,
        },
        // FIXME: try and pull userId from message? Or just fix the platform types to have useful wrappers.
        userId: invalidUserRef().userId,
      };
    }
  }
}

function getPresenceEventData(
  docSchema: DocumentSchema,
  eventType: string,
  eventData: unknown,
  schemaVersion: unknown,
): PresenceEventData {
  const customPayload = readCustomPayload({
    data: eventData,
    docSchema,
    modelName: eventType,
    schemaVersion,
  });
  if (customPayload.type !== "readable") {
    return {
      rawData: eventData,
      rawType: eventType,
      type: PresenceEventDataType.UNKNOWN,
    };
  }

  return {
    eventData: customPayload.data,
    model: customPayload.model,
    schemaVersion: customPayload.schemaVersion,
    type: PresenceEventDataType.CUSTOM_EVENT,
  };
}
