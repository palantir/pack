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
} from "@osdk/foundry.pack";
import { invalidUserRef } from "@palantir/pack.auth";
import type {
  ActivityEvent,
  ActivityEventData,
  DocumentSchema,
  Model,
  ModelData,
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
import type { PresenceCollaborativeUpdate } from "@palantir/pack.state.foundry-event";

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
  { eventData, eventType }: FoundryActivityEvent,
): ActivityEventData {
  // TODO: handle standard activity events
  // TODO: validate model is valid for activity events
  const model = docSchema[eventType];
  if (model == null) {
    return {
      rawData: eventData.data,
      rawType: eventType,
      type: ActivityEventDataType.UNKNOWN,
    };
  }

  // TODO: validate data against model schema

  return {
    eventData: eventData.data as ModelData<Model>,
    model,
    type: ActivityEventDataType.CUSTOM_EVENT,
  };
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
): PresenceEvent {
  switch (foundryUpdate.type) {
    case "presenceChangeEvent": {
      const { userId, status } = foundryUpdate.presenceChangeEvent;
      const eventData = status === "PRESENT" ? ARRIVED_DATA : DEPARTED_DATA;
      return {
        eventData,
        userId: userId as UserId,
      };
    }

    case "customPresenceEvent": {
      const { userId, eventData } = foundryUpdate.customPresenceEvent;
      const presenceEventData = getPresenceEventData(documentSchema, eventData);
      return {
        eventData: presenceEventData,
        userId: userId as UserId,
      };
    }
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
  eventData: unknown,
): PresenceEventData {
  if (typeof eventData !== "object" || eventData == null) {
    return {
      rawData: eventData,
      rawType: "unknown",
      type: PresenceEventDataType.UNKNOWN,
    };
  }

  const typedEventData = eventData as Record<string, unknown>;
  const { eventType, eventData: data } = typedEventData;

  if (typeof eventType !== "string") {
    return {
      rawData: eventData,
      rawType: "unknown",
      type: PresenceEventDataType.UNKNOWN,
    };
  }

  const model = docSchema[eventType];
  if (model == null) {
    return {
      rawData: data,
      rawType: eventType,
      type: PresenceEventDataType.UNKNOWN,
    };
  }

  return {
    eventData: data,
    model,
    type: PresenceEventDataType.CUSTOM_EVENT,
  };
}
