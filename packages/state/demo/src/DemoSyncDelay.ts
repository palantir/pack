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

const DELAY_STORAGE_KEY = "pack-demo-sync-delay-ms";

type DelayStorage = Pick<Storage, "getItem" | "setItem">;

interface PendingSend {
  readonly dueAt: number;
  readonly key: string;
  readonly send: () => void;
}

/**
 * Simulated network latency for the demo document service, for trying out how concurrent
 * edits from several tabs merge.
 *
 * While a delay is set, other tabs receive this tab's document edits (and their activity
 * events) `delayMs` after they are made, in the order they were made. The delay is per tab:
 * it is kept in sessionStorage, so it survives reloads but not new tabs.
 */
export class DemoSyncDelay {
  private delay: number;
  private readonly listeners = new Set<() => void>();
  private pending: PendingSend[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly storage: DelayStorage | undefined = getSessionStorage()) {
    this.delay = readDelay(storage);
  }

  /** How long, in milliseconds, edits wait before other tabs receive them. 0 sends at once. */
  get delayMs(): number {
    return this.delay;
  }

  /** Edits made in this tab that other tabs haven't received yet. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Applies to edits made from now on. Setting 0 also sends everything waiting. */
  setDelayMs(delayMs: number): void {
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
    if (delay === this.delay) return;

    this.delay = delay;
    try {
      this.storage?.setItem(DELAY_STORAGE_KEY, String(delay));
    } catch {
      // sessionStorage may be unavailable
    }
    if (delay === 0) {
      this.flush();
    }
    this.notify();
  }

  /** Sends every waiting edit now, in order. */
  flush(): void {
    this.sendWhere(() => true);
  }

  /** Calls `listener` whenever `delayMs` or `pendingCount` changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Calls `send` once the delay has passed, after everything already waiting.
   * @internal
   */
  enqueue(key: string, send: () => void): void {
    if (this.delay === 0 && this.pending.length === 0) {
      send();
      return;
    }
    this.pending.push({ dueAt: Date.now() + this.delay, key, send });
    this.schedule();
    this.notify();
  }

  /**
   * Sends everything waiting for `key` now, in order.
   * @internal
   */
  flushKey(key: string): void {
    this.sendWhere(entry => entry.key === key);
  }

  private sendWhere(shouldSend: (entry: PendingSend) => boolean): void {
    const toSend = this.pending.filter(shouldSend);
    if (toSend.length === 0) return;

    this.pending = this.pending.filter(entry => !shouldSend(entry));
    toSend.forEach(entry => entry.send());
    this.schedule();
    this.notify();
  }

  private readonly sendDue = (): void => {
    this.timer = undefined;
    const now = Date.now();
    // Edits never overtake earlier ones, even if the delay was shortened in between.
    const dueCount = this.pending.findIndex(entry => entry.dueAt > now);
    const toSend = this.pending.splice(0, dueCount === -1 ? this.pending.length : dueCount);
    toSend.forEach(entry => entry.send());
    this.schedule();
    if (toSend.length > 0) {
      this.notify();
    }
  };

  private schedule(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const next = this.pending[0];
    if (next != null) {
      this.timer = setTimeout(this.sendDue, Math.max(0, next.dueAt - Date.now()));
    }
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}

/** The sync delay for this tab, used by every DemoDocumentService unless one is passed in. */
export const demoSyncDelay: DemoSyncDelay = new DemoSyncDelay();

function getSessionStorage(): DelayStorage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function readDelay(storage: DelayStorage | undefined): number {
  try {
    const stored = Number(storage?.getItem(DELAY_STORAGE_KEY) ?? 0);
    return Number.isFinite(stored) ? Math.max(0, stored) : 0;
  } catch {
    return 0;
  }
}
