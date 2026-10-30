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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoSyncDelay } from "../DemoSyncDelay.js";

function createStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("DemoSyncDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends immediately with no delay", () => {
    const syncDelay = new DemoSyncDelay(createStorage());
    const send = vi.fn();

    syncDelay.enqueue("doc", send);

    expect(send).toHaveBeenCalledOnce();
    expect(syncDelay.pendingCount).toBe(0);
  });

  it("holds sends until the delay has passed", () => {
    const syncDelay = new DemoSyncDelay(createStorage());
    syncDelay.setDelayMs(5000);
    const listener = vi.fn();
    syncDelay.subscribe(listener);
    const send = vi.fn();

    syncDelay.enqueue("doc", send);
    expect(syncDelay.pendingCount).toBe(1);
    expect(listener).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledOnce();
    expect(syncDelay.pendingCount).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps sends in order when the delay is shortened", () => {
    const syncDelay = new DemoSyncDelay(createStorage());
    const sent: string[] = [];
    syncDelay.setDelayMs(10_000);
    syncDelay.enqueue("doc", () => sent.push("first"));
    syncDelay.setDelayMs(1000);
    syncDelay.enqueue("doc", () => sent.push("second"));

    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(9000);
    expect(sent).toEqual(["first", "second"]);
  });

  it("sends everything waiting when the delay is turned off", () => {
    const syncDelay = new DemoSyncDelay(createStorage());
    const sent: string[] = [];
    syncDelay.setDelayMs(5000);
    syncDelay.enqueue("a", () => sent.push("a"));
    syncDelay.enqueue("b", () => sent.push("b"));

    syncDelay.setDelayMs(0);

    expect(sent).toEqual(["a", "b"]);
    expect(syncDelay.pendingCount).toBe(0);
  });

  it("flushes only the sends for one key", () => {
    const syncDelay = new DemoSyncDelay(createStorage());
    const sent: string[] = [];
    syncDelay.setDelayMs(5000);
    syncDelay.enqueue("a", () => sent.push("a1"));
    syncDelay.enqueue("b", () => sent.push("b1"));
    syncDelay.enqueue("a", () => sent.push("a2"));

    syncDelay.flushKey("a");
    expect(sent).toEqual(["a1", "a2"]);
    expect(syncDelay.pendingCount).toBe(1);

    vi.advanceTimersByTime(5000);
    expect(sent).toEqual(["a1", "a2", "b1"]);
  });

  it("remembers the delay in storage", () => {
    const storage = createStorage();
    new DemoSyncDelay(storage).setDelayMs(3000);

    expect(new DemoSyncDelay(storage).delayMs).toBe(3000);
  });
});
