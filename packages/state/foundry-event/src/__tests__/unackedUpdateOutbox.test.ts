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
import type { Mock } from "vitest";
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

/** sendCount of the update in the most recent resend. Starts at 1 for the initial send. */
function lastSendCount(resend: Mock<ResendHandler>): number {
  return resend.mock.calls.at(-1)![0][0]!.sendCount;
}

describe("createUnackedUpdateOutbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks added updates until they are acked", () => {
    const outbox = createUnackedUpdateOutbox(vi.fn(), { onRequiresRefresh: vi.fn() });

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
      onRequiresRefresh: vi.fn(),
      resendIntervalMs: 2_000,
      resendAfterMs: 2_000,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(2_000);

    expect(resend).toHaveBeenCalledTimes(1);
    expect(editIds(resend.mock.calls[0]![0])).toEqual(["e1"]);
    expect(lastSendCount(resend)).toBe(2);
  });

  it("keeps resending an unacked update until it is acked", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      onRequiresRefresh: vi.fn(),
      resendIntervalMs: 2_000,
      resendAfterMs: 2_000,
    });

    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(6_000); // three resend ticks

    expect(resend).toHaveBeenCalledTimes(3);
    expect(lastSendCount(resend)).toBe(4);

    outbox.ack(["e1" as EditId]);
    resend.mockClear();

    vi.advanceTimersByTime(6_000);
    expect(resend).not.toHaveBeenCalled();
  });

  it("does not resend an update before the staleness threshold", () => {
    const resend = vi.fn<ResendHandler>();
    const outbox = createUnackedUpdateOutbox(resend, {
      onRequiresRefresh: vi.fn(),
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
      onRequiresRefresh: vi.fn(),
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
    const outbox = createUnackedUpdateOutbox(vi.fn(), { onRequiresRefresh: vi.fn() });

    outbox.add("e1" as EditId, makePublishMessage("e1"));
    outbox.ack(["unknown" as EditId]);

    expect(outbox.size()).toBe(1);
    expect(outbox.hasUnackedUpdates()).toBe(true);
  });

  it("fails once when six actual sends remain unacked and never rearms", () => {
    const resend = vi.fn<ResendHandler>();
    const onRequiresRefresh = vi.fn<(updates: readonly UnackedUpdate[]) => void>();
    const outbox = createUnackedUpdateOutbox(resend, { onRequiresRefresh });
    outbox.add("e1" as EditId, makePublishMessage("e1"));

    vi.advanceTimersByTime(10_000); // five 2s ticks: sendCount reaches the cap of 6
    expect(resend).toHaveBeenCalledTimes(5);
    expect(onRequiresRefresh).not.toHaveBeenCalled();
    expect(lastSendCount(resend)).toBe(6);

    // Include a newer edit: the whole document stops, including its healthy queue entries.
    outbox.add("e2" as EditId, makePublishMessage("e2"));
    vi.advanceTimersByTime(2_000);
    expect(onRequiresRefresh).toHaveBeenCalledOnce();
    expect(editIds(onRequiresRefresh.mock.calls[0]![0])).toEqual(["e1"]);
    expect(outbox.size()).toBe(0);
    expect(resend).toHaveBeenCalledTimes(5);

    outbox.clear();
    outbox.ack(["e1" as EditId]);
    outbox.add("e3" as EditId, makePublishMessage("e3"));
    vi.advanceTimersByTime(60_000);
    expect(outbox.size()).toBe(0);
    expect(onRequiresRefresh).toHaveBeenCalledOnce();
    expect(resend).toHaveBeenCalledTimes(5);
  });

  it("accepts an ack after the sixth send before the next retry check", () => {
    const onRequiresRefresh = vi.fn<(updates: readonly UnackedUpdate[]) => void>();
    const outbox = createUnackedUpdateOutbox(vi.fn(), { onRequiresRefresh });
    outbox.add("e1" as EditId, makePublishMessage("e1"));
    vi.advanceTimersByTime(10_000); // five 2s ticks: sendCount reaches the cap of 6
    outbox.ack(["e1" as EditId]);
    vi.advanceTimersByTime(60_000);
    expect(onRequiresRefresh).not.toHaveBeenCalled();
    expect(outbox.size()).toBe(0);
  });

  it("holds the retry budget while disconnected and resumes it on reconnect", () => {
    const resend = vi.fn<ResendHandler>();
    const onRequiresRefresh = vi.fn<(updates: readonly UnackedUpdate[]) => void>();
    let connected = true;
    const outbox = createUnackedUpdateOutbox(resend, {
      isConnected: () => connected,
      onRequiresRefresh,
    });
    outbox.add("e1" as EditId, makePublishMessage("e1"));

    // Spend most of the budget, then drop: an outage far past the cutoff must not exhaust it.
    vi.advanceTimersByTime(8_000);
    expect(resend).toHaveBeenCalledTimes(4);
    connected = false;
    vi.advanceTimersByTime(600_000);
    expect(resend).toHaveBeenCalledTimes(4);
    expect(onRequiresRefresh).not.toHaveBeenCalled();

    // Reconnecting resumes where it left off: the update is already stale, so it resends at once.
    connected = true;
    vi.advanceTimersByTime(2_000);
    expect(resend).toHaveBeenCalledTimes(5);
    expect(lastSendCount(resend)).toBe(6);
    vi.advanceTimersByTime(2_000);
    expect(editIds(onRequiresRefresh.mock.calls[0]![0])).toEqual(["e1"]);
  });
});
