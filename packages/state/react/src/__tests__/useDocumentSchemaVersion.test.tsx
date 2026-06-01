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
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import { DocumentRefBrand } from "@palantir/pack.document-schema.model-types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDocumentSchemaVersion } from "../hooks/useDocumentSchemaVersion.js";

type MetadataCallback = (docRef: DocumentRef<DocumentSchema>, metadata: DocumentMetadata) => void;

function metadata(schemaVersion?: number): DocumentMetadata {
  const baseMetadata = {
    documentTypeName: "TestType",
    name: "Test Document",
    ontologyRid: "ri.ontology.main.ontology.test",
    security: {
      discretionary: {},
      mandatory: {},
    },
  };
  return schemaVersion != null ? { ...baseMetadata, schemaVersion } : baseMetadata;
}

function createTestDocRef(initialVersion: number): {
  readonly docRef: DocumentRef<DocumentSchema>;
  readonly emitMetadata: (metadata: DocumentMetadata) => void;
  readonly setCurrentVersion: (version: number) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
} {
  let currentVersion = initialVersion;
  let callback: MetadataCallback | undefined;
  const unsubscribe = vi.fn();

  const docRef = {
    id: "doc-1" as DocumentId,
    schema: {} as DocumentSchema,
    [DocumentRefBrand]: DocumentRefBrand,
    get version(): number {
      return currentVersion;
    },
    onMetadataChange: (cb: MetadataCallback) => {
      callback = cb;
      return unsubscribe;
    },
  } as unknown as DocumentRef<DocumentSchema>;

  return {
    docRef,
    emitMetadata: newMetadata => {
      if (newMetadata.schemaVersion != null) {
        currentVersion = newMetadata.schemaVersion;
      }
      callback?.(docRef, newMetadata);
    },
    setCurrentVersion: version => {
      currentVersion = version;
    },
    unsubscribe,
  };
}

describe("useDocumentSchemaVersion", () => {
  it("updates when document metadata reports a new schema version", () => {
    const { docRef, emitMetadata, unsubscribe } = createTestDocRef(1);

    const { result, unmount } = renderHook(() => useDocumentSchemaVersion(docRef));

    expect(result.current).toBe(1);

    act(() => {
      emitMetadata(metadata(2));
    });

    expect(result.current).toBe(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("falls back to docRef.version when metadata omits schemaVersion", () => {
    const { docRef, emitMetadata, setCurrentVersion } = createTestDocRef(1);

    const { result } = renderHook(() => useDocumentSchemaVersion(docRef));

    expect(result.current).toBe(1);

    setCurrentVersion(3);
    act(() => {
      emitMetadata(metadata());
    });

    expect(result.current).toBe(3);
  });
});
