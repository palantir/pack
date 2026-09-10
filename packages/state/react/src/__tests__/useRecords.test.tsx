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

import type { PackApp } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentRef,
  DocumentSchema,
  Model,
  RecordCollectionRef,
  RecordRef,
} from "@palantir/pack.document-schema.model-types";
import type { WithStateModule } from "@palantir/pack.state.core";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mock, mockDeep } from "vitest-mock-extended";
import { useDocRef } from "../hooks/useDocRef.js";
import { useRecords } from "../hooks/useRecords.js";

describe("useRecords", () => {
  it("handles a missing document ID, subscribes when available, and cleans up when cleared", () => {
    const app = mockDeep<WithStateModule<PackApp>>();
    const schema = mock<DocumentSchema>();
    const model = mock<Model>();
    const record = mock<RecordRef>();
    const collection = mock<RecordCollectionRef>({
      [Symbol.iterator]: () => [record][Symbol.iterator](),
    });
    const docRef = mock<DocumentRef>({ id: "doc-1" });
    const unsubscribeAdded = vi.fn();
    const unsubscribeDeleted = vi.fn();

    collection.onItemsAdded.mockReturnValue(unsubscribeAdded);
    collection.onItemsDeleted.mockReturnValue(unsubscribeDeleted);
    docRef.getRecords.mockReturnValue(collection);
    app.state.createDocRef.mockReturnValue(docRef);

    const { rerender, result, unmount } = renderHook(
      ({ documentId }: { documentId: DocumentId | undefined }) => {
        const doc = useDocRef(app, schema, documentId);
        return useRecords(doc, model);
      },
      { initialProps: { documentId: undefined as DocumentId | undefined } },
    );

    expect(result.current).toEqual([]);
    expect(app.state.createDocRef).not.toHaveBeenCalled();
    expect(collection.onItemsAdded).not.toHaveBeenCalled();
    expect(collection.onItemsDeleted).not.toHaveBeenCalled();

    rerender({ documentId: "doc-1" });

    expect(result.current).toEqual([record]);
    expect(docRef.getRecords.mock.calls).toEqual([[model]]);
    expect(collection.onItemsAdded).toHaveBeenCalledOnce();
    expect(collection.onItemsDeleted).toHaveBeenCalledOnce();

    rerender({ documentId: undefined });

    expect(result.current).toEqual([]);
    expect(unsubscribeAdded).toHaveBeenCalledOnce();
    expect(unsubscribeDeleted).toHaveBeenCalledOnce();
    expect(collection.onItemsAdded).toHaveBeenCalledOnce();
    expect(collection.onItemsDeleted).toHaveBeenCalledOnce();

    unmount();
  });
});
