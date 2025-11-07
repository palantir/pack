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

import type { Model, ModelData } from "./Model.js";
import type { UserId } from "./UserRef.js";

export const PresenceEventDataType = {
  ARRIVED: "presenceArrived",
  DEPARTED: "presenceDeparted",
  CUSTOM_EVENT: "customEvent",
  UNKNOWN: "unknown",
} as const;

export type PresenceEventDataType =
  typeof PresenceEventDataType[keyof typeof PresenceEventDataType];

export interface PresenceEventDataArrived {
  readonly type: typeof PresenceEventDataType.ARRIVED;
}

export interface PresenceEventDataDeparted {
  readonly type: typeof PresenceEventDataType.DEPARTED;
}

export interface PresenceEventDataCustom<M extends Model = Model> {
  readonly type: typeof PresenceEventDataType.CUSTOM_EVENT;
  readonly eventData: ModelData<M>;
  readonly model: M;
}

export interface PresenceEventUnknown {
  readonly type: "unknown";
  readonly rawType: string;
  readonly rawData: unknown;
}

export type PresenceEventData =
  | PresenceEventDataArrived
  | PresenceEventDataDeparted
  | PresenceEventDataCustom
  | PresenceEventUnknown;

export interface PresenceEvent {
  readonly userId: UserId;
  readonly eventData: PresenceEventData;
}
