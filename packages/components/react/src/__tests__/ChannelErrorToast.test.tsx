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

import { ChannelErrorCode } from "@palantir/pack.document-schema.model-types";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChannelErrorToast } from "../channelErrorToast/ChannelErrorToast.js";

describe("ChannelErrorToast", () => {
  it("names the channel that failed, in sentence case", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="presence"
        error={{ code: ChannelErrorCode.UNKNOWN, errorInstanceId: "" }}
      />,
    );

    expect(container.textContent).toContain("Presence channel error");
  });

  it("renders an overridden title verbatim, without re-casing it", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{ code: ChannelErrorCode.UNKNOWN, errorInstanceId: "" }}
        title="Could not reach the server"
      />,
    );

    // CSS `text-transform: capitalize` would render "Could Not Reach The Server" — wrong in most
    // languages, and wrong for any caller-supplied string.
    expect(container.textContent).toContain("Could not reach the server");
  });

  it("prefers the error's own message over the per-code fallback", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{
          code: ChannelErrorCode.UNKNOWN,
          errorInstanceId: "",
          message: "Socket closed unexpectedly",
        }}
      />,
    );

    expect(container.textContent).toContain("Socket closed unexpectedly");
    expect(container.textContent).not.toContain("The connection encountered an error.");
  });

  it("falls back to per-code guidance when the error carries no message", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{ code: ChannelErrorCode.CLIENT_VERSION_TOO_LOW, errorInstanceId: "" }}
      />,
    );

    expect(container.textContent).toContain(
      "This document requires a newer version of the app. Please refresh.",
    );
  });

  it("lets an app override the copy for a specific code", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{ code: ChannelErrorCode.REVISION_TOO_OLD, errorInstanceId: "" }}
        messages={{ [ChannelErrorCode.REVISION_TOO_OLD]: "Custom copy for this code." }}
      />,
    );

    expect(container.textContent).toContain("Custom copy for this code.");
    expect(container.textContent).not.toContain("Your session is out of date.");
  });

  it("prefers an override over the error's own message, so `unknown` stays localizable", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{
          code: ChannelErrorCode.UNKNOWN,
          errorInstanceId: "",
          message: "WebSocket closed: 1006",
        }}
        messages={{ [ChannelErrorCode.UNKNOWN]: "Connection lost, retrying." }}
      />,
    );

    expect(container.textContent).toContain("Connection lost, retrying.");
    expect(container.textContent).not.toContain("WebSocket closed: 1006");
  });

  it("hides the `unknown` code, which means nothing to a user", () => {
    const { container } = render(
      <ChannelErrorToast
        channel="data"
        error={{ code: ChannelErrorCode.UNKNOWN, errorInstanceId: "abc-123" }}
      />,
    );

    expect(container.textContent).not.toContain("unknown");
    // The correlation id still shows, so the failure stays reportable.
    expect(container.textContent).toContain("abc-123");
  });
});
