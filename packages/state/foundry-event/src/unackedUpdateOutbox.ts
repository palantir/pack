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

/** A published update awaiting server acknowledgement. */
export interface UnackedUpdate {
  /** Re-published verbatim on resend; the stable editId lets the server dedupe. */
  readonly publishMessage: DocumentPublishMessage;
  /** When first published. Stable across resends, so staleness is measured from the first send. */
  readonly timeAdded: number;
  /** Times sent (initial send + resends). */
  sendCount: number;
}

/** Called with updates that have gone unacked long enough to resend. */
export type ResendHandler = (updates: readonly UnackedUpdate[]) => void;

export interface UnackedUpdateOutboxOptions {
  /** How often the resend loop runs, in ms. Defaults to 2000. */
  readonly resendIntervalMs?: number;
  /** Resend an update once it has been unacked this long, in ms. Defaults to 2000. */
  readonly resendAfterMs?: number;
  /** Injectable clock, for testing. Defaults to Date.now. */
  readonly now?: () => number;
}

/** Tracks published updates until the server acks them, resending any that stay unacked. */
export interface UnackedUpdateOutbox {
  /** Track a published update so it is resent until acked. */
  add(editId: EditId, publishMessage: DocumentPublishMessage): void;
  /** Drop the given acked updates. Unknown editIds are ignored. */
  ack(editIds: readonly EditId[]): void;
  hasUnackedUpdates(): boolean;
  size(): number;
  /** Drop all tracked updates and stop the resend loop. */
  clear(): void;
}

const DEFAULT_RESEND_INTERVAL_MS = 2_000;
const DEFAULT_RESEND_AFTER_MS = 2_000;

export function createUnackedUpdateOutbox(
  resend: ResendHandler,
  options: UnackedUpdateOutboxOptions = {},
): UnackedUpdateOutbox {
  const {
    resendIntervalMs = DEFAULT_RESEND_INTERVAL_MS,
    resendAfterMs = DEFAULT_RESEND_AFTER_MS,
    now = Date.now,
  } = options;

  const unackedUpdates = new Map<EditId, UnackedUpdate>();
  // Runs only while updates are unacked: started on the first add, stopped once drained.
  let resendTimer: ReturnType<typeof setInterval> | undefined;

  function startResendLoop(): void {
    if (resendTimer == null) {
      resendTimer = setInterval(resendStaleUpdates, resendIntervalMs);
    }
  }

  function stopResendLoop(): void {
    if (resendTimer != null) {
      clearInterval(resendTimer);
      resendTimer = undefined;
    }
  }

  function resendStaleUpdates(): void {
    if (unackedUpdates.size === 0) {
      stopResendLoop();
      return;
    }

    const current = now();
    const stale: UnackedUpdate[] = [];
    for (const update of unackedUpdates.values()) {
      if (current - update.timeAdded >= resendAfterMs) {
        update.sendCount += 1;
        stale.push(update);
      }
    }

    // TODO(follow-up): escalate to a fatal state / resubscribe once an update stays
    // unacked too long; for now it is resent until acked or the sync is stopped.
    if (stale.length > 0) {
      resend(stale);
    }
  }

  return {
    add(editId, publishMessage) {
      unackedUpdates.set(editId, {
        publishMessage,
        timeAdded: now(),
        sendCount: 1,
      });
      startResendLoop();
    },
    ack(editIds) {
      for (const editId of editIds) {
        unackedUpdates.delete(editId);
      }
      if (unackedUpdates.size === 0) {
        stopResendLoop();
      }
    },
    hasUnackedUpdates() {
      return unackedUpdates.size > 0;
    },
    size() {
      return unackedUpdates.size;
    },
    clear() {
      unackedUpdates.clear();
      stopResendLoop();
    },
  };
}
