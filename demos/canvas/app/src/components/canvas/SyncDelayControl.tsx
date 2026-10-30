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

import { Button, Popover, Slider, Switch, Tag } from "@blueprintjs/core";
import { demoSyncDelay } from "@palantir/pack.state.demo";
import { memo, useState, useSyncExternalStore } from "react";
import styles from "./SyncDelayControl.module.css";

const DEFAULT_DELAY_S = 5;
const MAX_DELAY_S = 15;

const subscribe = (listener: () => void) => demoSyncDelay.subscribe(listener);
const getDelayMs = () => demoSyncDelay.delayMs;
const getPendingCount = () => demoSyncDelay.pendingCount;

/** Demo-mode control for delaying this tab's edits, to try out concurrent edits in two windows. */
export const SyncDelayControl = memo(function SyncDelayControl() {
  const delayMs = useSyncExternalStore(subscribe, getDelayMs);
  const pendingCount = useSyncExternalStore(subscribe, getPendingCount);
  const isDelayed = delayMs > 0;

  return (
    <Popover content={<SyncDelaySettings delayMs={delayMs} pendingCount={pendingCount} />}>
      <Button
        icon="time"
        intent={isDelayed ? "warning" : "none"}
        title="Simulated sync delay"
      >
        {isDelayed ? `Sync: ${delayMs / 1000}s delay` : "Sync: live"}
        {pendingCount > 0 && (
          <Tag className={styles.pendingTag} minimal={true} round={true}>
            {pendingCount} queued
          </Tag>
        )}
      </Button>
    </Popover>
  );
});

function SyncDelaySettings({
  delayMs,
  pendingCount,
}: {
  readonly delayMs: number;
  readonly pendingCount: number;
}) {
  // Remembers the slider position while the delay is off.
  const [delayS, setDelayS] = useState(delayMs > 0 ? delayMs / 1000 : DEFAULT_DELAY_S);
  const isDelayed = delayMs > 0;

  const handleDelayChange = (value: number) => {
    setDelayS(value);
    demoSyncDelay.setDelayMs(value * 1000);
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.header}>Simulated sync delay</h2>
      <p className={styles.description}>
        Other windows receive edits made in this window after the delay. Set it in each window that
        should lag.
      </p>
      <Switch
        checked={isDelayed}
        label="Delay edits from this window"
        onChange={() => demoSyncDelay.setDelayMs(isDelayed ? 0 : delayS * 1000)}
      />
      <Slider
        disabled={!isDelayed}
        labelRenderer={value => `${value}s`}
        labelStepSize={5}
        max={MAX_DELAY_S}
        min={1}
        onChange={handleDelayChange}
        stepSize={1}
        value={delayS}
      />
      <div className={styles.queue}>
        <span>{pendingCount === 1 ? "1 edit waiting" : `${pendingCount} edits waiting`}</span>
        <Button
          disabled={pendingCount === 0}
          onClick={() => demoSyncDelay.flush()}
          size="small"
          text="Send now"
        />
      </div>
      <Button
        fill={true}
        icon="open-application"
        onClick={openInNewWindow}
        text="Open in new window"
      />
    </div>
  );
}

function openInNewWindow() {
  // noopener gives the new window its own sessionStorage, so it is a separate demo user with its
  // own sync delay.
  window.open(
    window.location.href,
    "_blank",
    `noopener,popup,width=${window.outerWidth},height=${window.outerHeight}`,
  );
}
