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
  DocumentRef,
  EditDescription,
  RecordCollectionRef,
  RecordId,
  RecordRef,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata } from "@palantir/pack.document-schema.model-types";
import type { ReactNode } from "react";
import { createContext, createElement, useContext, useMemo } from "react";

interface DocumentScopeConstraint {
  readonly version: number;
}

export interface CreateDocumentScopeResult<S extends DocumentScopeConstraint> {
  useDocumentScope: () => S;
  DocumentScopeProvider: React.FC<{ docRef: DocumentRef; children: ReactNode }>;
}

/**
 * Creates a typed document scope context for version-aware document operations.
 *
 * The returned `DocumentScopeProvider` reads the schema version from the
 * `docRef` and exposes a scope object with `updateRecord`,
 * `setCollectionRecord`, `deleteRecord`, and `withTransaction` methods.
 *
 * The generic `S` is typically the generated `DocumentScope` union type from
 * the application's codegen output, allowing consumers to narrow by version.
 *
 * @example
 * ```tsx
 * import type { DocumentScope } from "@myapp/schema";
 * import { createDocumentScope } from "@palantir/pack.state.react";
 *
 * const { useDocumentScope, DocumentScopeProvider } = createDocumentScope<DocumentScope>();
 * ```
 */
export function createDocumentScope<
  S extends DocumentScopeConstraint,
>(): CreateDocumentScopeResult<S> {
  const ScopeContext = createContext<S | null>(null);

  function useDocumentScope(): S {
    const scope = useContext(ScopeContext);
    if (scope == null) {
      throw new Error(
        "useDocumentScope must be used within a DocumentScopeProvider.",
      );
    }
    return scope;
  }

  function DocumentScopeProvider({
    docRef,
    children,
  }: {
    docRef: DocumentRef;
    children: ReactNode;
  }): ReactNode {
    const version = getMetadata(docRef.schema).version;

    const scope = useMemo(
      () =>
        ({
          version,
          docRef,
          updateRecord: (ref: RecordRef, data: unknown) => ref.update(data as any),
          setCollectionRecord: (
            ref: RecordRef,
            data: unknown,
          ) => {
            const collection: RecordCollectionRef = docRef.getRecords(ref.model);
            return collection.set(ref.id as RecordId, data as any);
          },
          deleteRecord: (ref: RecordRef) => ref.delete(),
          withTransaction: (fn: () => void, description?: EditDescription) =>
            docRef.withTransaction(fn, description),
        }) as unknown as S,
      [docRef, version],
    );

    return createElement(ScopeContext.Provider, { value: scope }, children);
  }

  return { useDocumentScope, DocumentScopeProvider };
}
