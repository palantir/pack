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

import type { Flavored } from "@palantir/pack.core";
import type { Model, ModelData } from "./Model.js";
import type { UserId } from "./UserRef.js";

export type ActivityEventId = Flavored<"pack:EventId">;

export const ActivityEventDataType = {
  CUSTOM_EVENT: "customEvent",
  UNKNOWN: "unknown",
} as const;

/**
 * Application specific custom activity event data, as described in a transaction edit,
 * using an application sdk's generated model types.
 *
 * @example
 * ```ts
 * const unsubscribe = docRef.onActivity((docRef, event) => {
 *   console.log("Activity event:", event);
 * });
 * // Submit an edit with a description to generate an activity event.
 * docRef.withTransaction(() => {
 *   // make some edits to the document here
 * }, {
 *   model: MyEventModel,
 *   data: {
 *     myDataField: "some value",
 *     foo: 42,
 *   },
 * });
 * ```
 */
export interface ActivityEventDataCustom<M extends Model = Model> {
  readonly type: typeof ActivityEventDataType.CUSTOM_EVENT;
  readonly model: M;
  readonly eventData: ModelData<M>;
}

// TODO: add standard document activity events (need to be added to api types)

/**
 * Fallback for unrecognized activity event types.
 *
 * This allows some flexibility with new event types added to the platform.
 * Likely unknown events represent a new platform event type and will be handled
 * in a future release of pack libraries and can be safely ignored by
 * applications.
 */
export interface ActivityEventDataUnknown {
  readonly type: typeof ActivityEventDataType.UNKNOWN;
  readonly rawType: string;
  readonly rawData: unknown;
}

export type ActivityEventData = ActivityEventDataCustom | ActivityEventDataUnknown;

/**
 * An event representing an activity that has occurred on a document. This
 * includes standard document events as well as custom application-specific
 * events describing document edits.
 *
 * ActivityEvents are useful for building activity feeds, or notifications.
 */
export interface ActivityEvent {
  /** Multiple events with the same aggregationKey may be collapsed. */
  readonly aggregationKey: string;
  readonly createdBy: UserId;
  readonly createdInstant: number;
  readonly eventData: ActivityEventData;
  readonly eventId: ActivityEventId;
  readonly isRead: boolean;
}
