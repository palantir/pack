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

export interface ActivityEventDataCustom<M extends Model = Model> {
  readonly type: typeof ActivityEventDataType.CUSTOM_EVENT;
  readonly model: M;
  readonly eventData: ModelData<M>;
}

// TODO: add standard document activity events (need to be added to api types)

export interface ActivityEventDataUnknown {
  readonly type: "unknown";
  readonly rawType: string;
  readonly rawData: unknown;
}

export type ActivityEventData = ActivityEventDataCustom | ActivityEventDataUnknown;

export interface ActivityEvent {
  readonly aggregationKey: string;
  readonly createdBy: UserId;
  readonly createdInstant: number;
  readonly eventData: ActivityEventData;
  readonly eventId: ActivityEventId;
  readonly isRead: boolean;
}
