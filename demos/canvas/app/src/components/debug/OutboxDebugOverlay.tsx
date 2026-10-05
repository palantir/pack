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

import { useEffect, useState } from "react";
import styles from "./OutboxDebugOverlay.module.css";

/** Mirrors UnackedUpdateOutboxStats in @palantir/pack.state.foundry-event. */
interface OutboxStats {
  readonly highestSendCount: number;
  readonly lastAckLatencyMs: number | undefined;
  readonly oldestAgeMs: number;
  readonly peakSize: number;
  readonly sendLimit: number;
  readonly size: number;
  readonly totalResends: number;
}

interface PackDebugGlobal {
  __PACK_DEBUG__?: { getOutboxStats: () => Record<string, OutboxStats> };
}

const POLL_INTERVAL_MS = 500;

function formatMs(ms: number | undefined): string {
  if (ms == null) {
    return "-";
  }
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Dev-only overlay showing live unacked-update outbox stats per document. */
export const OutboxDebugOverlay = () => {
  const [statsByDocId, setStatsByDocId] = useState<Record<string, OutboxStats>>({});

  useEffect(() => {
    const intervalId = setInterval(() => {
      const latest = (globalThis as PackDebugGlobal).__PACK_DEBUG__?.getOutboxStats() ?? {};
      // Merge so a document's last numbers stay visible after its outbox is gone, e.g. on forced refresh.
      setStatsByDocId(prev => ({ ...prev, ...latest }));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const entries = Object.entries(statsByDocId);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      {entries.map(([docId, stats]) => (
        <dl className={styles.stats} key={docId}>
          <dt>Doc</dt>
          <dd className={styles.docId}>{docId}</dd>
          <dt>Unacked</dt>
          <dd>{stats.size} (peak {stats.peakSize})</dd>
          <dt>Oldest wait</dt>
          <dd>{formatMs(stats.oldestAgeMs)}</dd>
          <dt>Last ack</dt>
          <dd>{formatMs(stats.lastAckLatencyMs)}</dd>
          <dt>Max sends</dt>
          <dd>{stats.highestSendCount} / {stats.sendLimit}</dd>
          <dt>Resends</dt>
          <dd>{stats.totalResends}</dd>
        </dl>
      ))}
    </div>
  );
};
