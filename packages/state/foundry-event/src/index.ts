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

export { EventServiceCometD } from "./cometd/EventServiceCometD.js";
export { createFoundryEventService, FoundryEventService } from "./FoundryEventService.js";
export type { SyncSession } from "./FoundryEventService.js";
export type {
  ChannelId,
  EventService,
  EventServiceLogLevel,
  SubscriptionId,
  TypedPublishChannelId,
  TypedReceiveChannelId,
} from "./types/EventService.js";
