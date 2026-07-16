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

import type { PackAppInternal } from "@palantir/pack.core";
import type { Callback, CometD, ListenerHandle, Message, SubscriptionHandle } from "cometd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import type { CometDLoader } from "../cometd/EventServiceCometD.js";
import { EventServiceCometD } from "../cometd/EventServiceCometD.js";
import type { TypedPublishChannelId, TypedReceiveChannelId } from "../types/EventService.js";

const mockAuthModule = {
  getToken: vi.fn().mockResolvedValue("mock-token"),
  onTokenChange: vi.fn(),
};

const mockLogger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

const mockApp = {
  config: {
    logger: mockLogger,
    remote: {
      packEventsUrl: "https://test.example.com/ws/cometd",
      baseUrl: "https://test.example.com",
    },
  },
  getModule: vi.fn().mockReturnValue(mockAuthModule),
} as unknown as PackAppInternal;

const CHANNEL = "/test/channel";

describe("EventServiceCometD error surfacing", () => {
  let mockCometD: MockProxy<CometD>;
  let service: EventServiceCometD;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCometD = mock();

    // Auto-succeed the handshake so initialize() resolves.
    mockCometD.addListener.mockImplementation((channel: string, callback: Callback) => {
      if (channel === "/meta/handshake") {
        setTimeout(() => {
          callback({
            channel: "/meta/handshake",
            clientId: "test-client-id",
            connectionType: "websocket",
            successful: true,
          });
        }, 0);
      }
      return { id: `listener-${Math.random()}` } as ListenerHandle;
    });
    mockCometD.configure.mockImplementation(() => {});
    mockCometD.registerExtension.mockImplementation(() => true);
    mockCometD.handshake.mockImplementation(() => {});
    mockCometD.batch.mockImplementation(callback => callback());

    const mockLoader = () => {
      class MockAckExtension {}
      class MockCometD {
        constructor() {
          return mockCometD;
        }
      }
      return Promise.resolve({ AckExtension: MockAckExtension, CometD: MockCometD });
    };

    service = new EventServiceCometD(mockApp, mockLoader as CometDLoader);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  /** Drive a publish that fails with the given CometD failure message, return the rejected error. */
  async function publishExpectingFailure(failureMessage: Partial<Message>): Promise<Error> {
    mockCometD.publish.mockImplementationOnce(
      (
        _channel: string,
        _content: unknown,
        publishCallbackOrProps?: Callback | object,
        maybePublishCallback?: Callback,
      ) => {
        const callback = typeof publishCallbackOrProps === "function"
          ? publishCallbackOrProps
          : maybePublishCallback;
        callback?.({ channel: CHANNEL, successful: false, ...failureMessage } as Message);
      },
    );

    const publishPromise = service.publish(
      CHANNEL as TypedPublishChannelId<object>,
      { hello: "world" },
    );
    const caught = publishPromise.then(
      () => {
        throw new Error("expected publish to reject");
      },
      (e: unknown) => e as Error,
    );
    await vi.runAllTimersAsync();
    return caught;
  }

  describe("publish", () => {
    it("surfaces client transport exceptions (e.g. maxSendBayeuxMessageSize exceeded)", async () => {
      const error = await publishExpectingFailure({
        failure: { exception: "maxSendBayeuxMessageSize 65536 exceeded" },
      } as Partial<Message>);

      expect(error.message).toContain("maxSendBayeuxMessageSize 65536 exceeded");
      expect(error.message).toContain(CHANNEL);
    });

    it("surfaces server-side Bayeux errors from message.error", async () => {
      const error = await publishExpectingFailure({ error: "403::channel_denied" });
      expect(error.message).toContain("403::channel_denied");
    });

    it("surfaces failure.reason when neither error nor exception present", async () => {
      const error = await publishExpectingFailure({
        failure: { reason: "connection closed" },
      } as Partial<Message>);
      expect(error.message).toContain("connection closed");
    });

    it("falls back to a placeholder when no error info is present", async () => {
      const error = await publishExpectingFailure({});
      expect(error.message).toContain("(no error message provided by server)");
    });

    it("attaches the raw failure message as the Error cause", async () => {
      const error = await publishExpectingFailure({
        failure: { exception: "boom", connectionType: "websocket" },
      } as Partial<Message>);
      expect(error.cause).toMatchObject({
        successful: false,
        failure: { exception: "boom" },
      });
    });
  });

  describe("subscribe", () => {
    async function subscribeExpectingFailure(failureMessage: Partial<Message>): Promise<Error> {
      let subscribeCallback: Callback | undefined;
      mockCometD.subscribe.mockImplementationOnce(
        (
          _channel: string,
          _messageCallback: Callback,
          subscribeCallbackOrProps: Callback | object,
          maybeSubscribeCallback?: Callback,
        ) => {
          subscribeCallback =
            (typeof subscribeCallbackOrProps === "function"
              ? subscribeCallbackOrProps
              : maybeSubscribeCallback) as Callback | undefined;
          return { id: "handle" } as SubscriptionHandle;
        },
      );

      const subscribePromise = service.subscribe(
        CHANNEL as TypedReceiveChannelId<object>,
        vi.fn(),
      );
      const caught = subscribePromise.then(
        () => {
          throw new Error("expected subscribe to reject");
        },
        (e: unknown) => e as Error,
      );
      // Let initialize()/handshake resolve so the subscribe callback is registered.
      await vi.runAllTimersAsync();
      subscribeCallback?.({ channel: CHANNEL, successful: false, ...failureMessage } as Message);
      await vi.runAllTimersAsync();
      return caught;
    }

    it("surfaces client transport exceptions", async () => {
      const error = await subscribeExpectingFailure({
        failure: { exception: "maxSendBayeuxMessageSize 65536 exceeded" },
      } as Partial<Message>);
      expect(error.message).toContain("maxSendBayeuxMessageSize 65536 exceeded");
      expect(error.message).toContain(CHANNEL);
    });

    it("surfaces server-side Bayeux errors", async () => {
      const error = await subscribeExpectingFailure({ error: "402::unknown_client" });
      expect(error.message).toContain("402::unknown_client");
    });

    it("surfaces failure.reason", async () => {
      const error = await subscribeExpectingFailure({
        failure: { reason: "denied" },
      } as Partial<Message>);
      expect(error.message).toContain("denied");
    });
  });
});
