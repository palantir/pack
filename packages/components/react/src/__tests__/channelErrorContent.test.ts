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

import type { ChannelError } from "@palantir/pack.document-schema.model-types";
import { ChannelErrorCode } from "@palantir/pack.document-schema.model-types";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_ERROR_MESSAGES,
  channelErrorContent,
} from "../channelErrorToast/channelErrorContent.js";

function error(overrides: Partial<ChannelError> = {}): ChannelError {
  return { code: ChannelErrorCode.INTERNAL_ERROR, errorInstanceId: "abc-123", ...overrides };
}

describe("channelErrorContent", () => {
  it("titles the channel in sentence case", () => {
    expect(channelErrorContent("data", error()).title).toBe("Data channel error");
    expect(channelErrorContent("metadata", error()).title).toBe("Metadata channel error");
  });

  it("lets the caller override the title", () => {
    const content = channelErrorContent("presence", error(), {
      formatTitle: channel => `Sync issue: ${channel}`,
    });

    expect(content.title).toBe("Sync issue: presence");
  });

  it("falls back to the default copy for the code", () => {
    const content = channelErrorContent("data", error({ code: ChannelErrorCode.REVISION_TOO_OLD }));

    expect(content.description).toBe(CHANNEL_ERROR_MESSAGES[ChannelErrorCode.REVISION_TOO_OLD]);
  });

  it("prefers the error's own message over the default copy", () => {
    const content = channelErrorContent("data", error({ message: "Specific server detail." }));

    expect(content.description).toBe("Specific server detail.");
  });

  it("prefers a caller override over the error's message, which is what localizes unknown", () => {
    const content = channelErrorContent(
      "data",
      error({ code: ChannelErrorCode.UNKNOWN, message: "raw upstream text" }),
      { messages: { [ChannelErrorCode.UNKNOWN]: "Localized copy." } },
    );

    expect(content.description).toBe("Localized copy.");
  });

  it("passes the code through, except unknown which tells the user nothing", () => {
    expect(channelErrorContent("data", error()).code).toBe(ChannelErrorCode.INTERNAL_ERROR);
    expect(channelErrorContent("data", error({ code: ChannelErrorCode.UNKNOWN })).code)
      .toBeUndefined();
  });

  it("omits a blank correlation id rather than showing an empty label", () => {
    expect(channelErrorContent("data", error()).correlationId).toBe("abc-123");
    expect(channelErrorContent("data", error({ errorInstanceId: "" })).correlationId)
      .toBeUndefined();
  });

  it("has default copy for every known error code", () => {
    for (const code of Object.values(ChannelErrorCode)) {
      expect(channelErrorContent("data", error({ code })).description).toBeTruthy();
    }
  });
});
