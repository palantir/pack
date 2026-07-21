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

import type {
  Model,
  ModelData,
  RecordId,
  RecordRef,
  RecordValidationError,
} from "@palantir/pack.document-schema.model-types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRecord } from "../hooks/useRecord.js";

interface User {
  id: string;
  name: string;
}

type UserModel = Model<User>;

function createMockRecordRef(): {
  readonly recordRef: RecordRef<UserModel>;
  readonly emitChange: (snapshot: ModelData<UserModel>) => void;
  readonly emitDeleted: () => void;
  readonly emitInvalid: (error: RecordValidationError) => void;
  readonly unsubscribeChange: ReturnType<typeof vi.fn>;
  readonly unsubscribeDeleted: ReturnType<typeof vi.fn>;
  readonly unsubscribeInvalid: ReturnType<typeof vi.fn>;
} {
  let changeCallback:
    | ((snapshot: ModelData<UserModel>, recordRef: RecordRef<UserModel>) => void)
    | undefined;
  let deletedCallback: ((recordRef: RecordRef<UserModel>) => void) | undefined;
  let invalidCallback:
    | ((error: RecordValidationError, recordRef: RecordRef<UserModel>) => void)
    | undefined;

  const unsubscribeChange = vi.fn();
  const unsubscribeDeleted = vi.fn();
  const unsubscribeInvalid = vi.fn();

  const recordRef = {
    id: "rec-1" as RecordId,
    model: {} as UserModel,
    onChange: (callback: typeof changeCallback) => {
      changeCallback = callback;
      return unsubscribeChange;
    },
    onDeleted: (callback: typeof deletedCallback) => {
      deletedCallback = callback;
      return unsubscribeDeleted;
    },
    onInvalid: (callback: typeof invalidCallback) => {
      invalidCallback = callback;
      return unsubscribeInvalid;
    },
  } as unknown as RecordRef<UserModel>;

  return {
    recordRef,
    emitChange: snapshot => act(() => changeCallback?.(snapshot, recordRef)),
    emitDeleted: () => act(() => deletedCallback?.(recordRef)),
    emitInvalid: error => act(() => invalidCallback?.(error, recordRef)),
    unsubscribeChange,
    unsubscribeDeleted,
    unsubscribeInvalid,
  };
}

const VALIDATION_ERROR: RecordValidationError = {
  modelName: "User",
  recordId: "rec-1" as RecordId,
  issues: [{ path: ["name"], message: "Required" }],
  message: "Record rec-1 does not match schema for model User (name: Required)",
};

describe("useRecord invalid state", () => {
  it("starts in loading state", () => {
    const { recordRef } = createMockRecordRef();
    const { result } = renderHook(() => useRecord(recordRef));
    expect(result.current).toEqual({ status: "loading", data: undefined });
  });

  it("transitions to invalid with the validation error", () => {
    const { recordRef, emitInvalid } = createMockRecordRef();
    const { result } = renderHook(() => useRecord(recordRef));

    emitInvalid(VALIDATION_ERROR);

    expect(result.current.status).toBe("invalid");
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(VALIDATION_ERROR);
  });

  it("recovers from invalid to loaded when a valid change arrives", () => {
    const { recordRef, emitChange, emitInvalid } = createMockRecordRef();
    const { result } = renderHook(() => useRecord(recordRef));

    emitInvalid(VALIDATION_ERROR);
    expect(result.current.status).toBe("invalid");

    const repaired: User = { id: "rec-1", name: "Jane" };
    emitChange(repaired);

    expect(result.current.status).toBe("loaded");
    expect(result.current.data).toEqual(repaired);
    expect(result.current.error).toBeUndefined();
  });

  it("transitions from invalid to deleted when the record is deleted", () => {
    const { recordRef, emitDeleted, emitInvalid } = createMockRecordRef();
    const { result } = renderHook(() => useRecord(recordRef));

    emitInvalid(VALIDATION_ERROR);
    emitDeleted();

    expect(result.current).toEqual({ status: "deleted", data: undefined });
  });

  it("unsubscribes all three subscriptions on unmount", () => {
    const { recordRef, unsubscribeChange, unsubscribeDeleted, unsubscribeInvalid } =
      createMockRecordRef();
    const { unmount } = renderHook(() => useRecord(recordRef));

    unmount();

    expect(unsubscribeChange).toHaveBeenCalledTimes(1);
    expect(unsubscribeDeleted).toHaveBeenCalledTimes(1);
    expect(unsubscribeInvalid).toHaveBeenCalledTimes(1);
  });
});
