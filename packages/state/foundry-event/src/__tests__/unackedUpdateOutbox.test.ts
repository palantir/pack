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

import type { DocumentPublishMessage, EditId } from "@osdk/foundry.pack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUnackedUpdateOutbox,
  type ResendHandler,
  type UnackedUpdate,
} from "../unackedUpdateOutbox.js";

function makePublishMessage(editId: string): DocumentPublishMessage {
  return {
    clientId: "client-1",
    clientSupportedVersionRange: { minVersion: 1, maxVersion: 1 },
    editId: editId as EditId,
    yjsUpdate: { data: `data-${editId}` },
  } satisfies DocumentPublishMessage;
}

function editIds(updates: readonly UnackedUpdate[]): string[] {
  return updates.map(update => update.publishMessage.editId);
}

describe("createUnackedUpdateOutbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks added updates until they are acked", () => {
    const outbox = createUnackedUpdateOutbox(vi.fn());

    expect(outbox.hasUnackedUpdates()).toBe(false);
    expect(outbox.size()).toBe(0);

    outbox.add("e1" as EditId, makePublishMessage("e1"));
    outbox.add("e2" as EditId, makePublishMessage("e2"));

    expect(outbox.hasUnackedUpdates()).toBe(true);
    expect(outbox.size()).toBe(2);

    outbox.ack(["e1" as EditId]);
    expect(outbox.size()).toBe(1);

    outbox.ack(["e2" as EditId]);
    expect(outbox.hasUnackedUpdates()).toBe(false);
    expect(outbox.size()).toBe(0);
  });

  it("resends an update once it has been unacked past the threshold", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      resendIntervalMs: 2_000,
      resendAfterMs: 2_000,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(2_000);

    expect(resend).toHaveBeenCalledTimes(1);
    expect(editIds(resend.mock.calls[0]![0])).toEqual(["e1"]);
    // sendCount starts at 1 (initial send) and increments on each resend.
    expect(resend.mock.calls[0]![0][0]!.sendCount).toBe(2);
  });

  it("keeps resending an unacked update until it is acked", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      resendIntervalMs: 2_000,
      resendAfterMs: 2_000,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(6_000); // three resend ticks

    expect(resend).toHaveBeenCalledTimes(3);
    expect(resend.mock.calls[2]![0][0]!.sendCount).toBe(4);

    outbox.ack(["e1" as EditId]);
    resend.mockClear();

    vi.advanceTimersByTime(6_000);
    expect(resend).not.toHaveBeenCalled();
  });

  it("does not resend an update before the staleness threshold", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      resendIntervalMs: 1_000,
      resendAfterMs: 1_500,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(1_000); // first tick, update is only 1s old
    expect(resend).not.toHaveBeenCalled();

    // A second update added later should not be resent on the same tick that
    // resends the older one, since staleness is measured from each add time.
    outbox.add("e2" as EditId, makePublishMessage("e2"));
    vi.advanceTimersByTime(1_000); // tick at 2s: e1 is 2s old, e2 is 1s old

    expect(resend).toHaveBeenCalledTimes(1);
    expect(editIds(resend.mock.calls[0]![0])).toEqual(["e1"]);
  });

  it("stops resending after it is cleared", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      resendIntervalMs: 2_000,
      resendAfterMs: 2_000,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));
    outbox.clear();

    expect(outbox.hasUnackedUpdates()).toBe(false);

    vi.advanceTimersByTime(6_000);
    expect(resend).not.toHaveBeenCalled();
  });

  it("ignores acks for updates it is not tracking", () => {
    const outbox = createUnackedUpdateOutbox(vi.fn());

    outbox.add("e1" as EditId, makePublishMessage("e1"));
    outbox.ack(["unknown" as EditId]);

    expect(outbox.size()).toBe(1);
    expect(outbox.hasUnackedUpdates()).toBe(true);
  });
});
