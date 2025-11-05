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

import type { PackApp } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentRef,
  DocumentSchema,
} from "@palantir/pack.document-schema.model-types";
import { invalidDocRef, type WithStateModule } from "@palantir/pack.state.core";
import { useMemo } from "react";

export function useDocRef<D extends DocumentSchema>(
  app: WithStateModule<PackApp>,
  docSchema: D,
  documentId: DocumentId | undefined,
): DocumentRef<D> {
  return useMemo(
    () => documentId != null ? app.state.createDocRef(documentId, docSchema) : invalidDocRef(),
    [app, documentId, docSchema],
  );
}
