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

import type {
  DocumentId,
  DocumentRef,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOnDocPresenceEvents } from "../hooks/useOnDocPresenceEvents.js";

describe("useOnDocPresenceEvents", () => {
  it("resubscribes when ignoreSelfUpdates changes", () => {
    const unsubscribeFirst = vi.fn();
    const unsubscribeSecond = vi.fn();
    const onPresence = vi.fn()
      .mockReturnValueOnce(unsubscribeFirst)
      .mockReturnValueOnce(unsubscribeSecond);
    const docRef = {
      id: "doc-1" as DocumentId,
      onPresence,
    } as unknown as DocumentRef<DocumentSchema>;

    const { rerender, unmount } = renderHook(
      ({ ignoreSelfUpdates }) => {
        useOnDocPresenceEvents(docRef, () => {}, { ignoreSelfUpdates });
      },
      { initialProps: { ignoreSelfUpdates: true } },
    );

    expect(onPresence).toHaveBeenCalledTimes(1);
    expect(onPresence.mock.calls[0]?.[1]).toEqual({ ignoreSelfUpdates: true });

    rerender({ ignoreSelfUpdates: false });

    expect(unsubscribeFirst).toHaveBeenCalledOnce();
    expect(onPresence).toHaveBeenCalledTimes(2);
    expect(onPresence.mock.calls[1]?.[1]).toEqual({ ignoreSelfUpdates: false });

    unmount();
    expect(unsubscribeSecond).toHaveBeenCalledOnce();
  });
});
