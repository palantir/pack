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

import type { Flavored } from "@palantir/pack.core";
import type { DocumentMetadata } from "./DocumentMetadata.js";
import type { DocumentSchema, DocumentState } from "./DocumentSchema.js";
import type { EditDescription, Model } from "./Model.js";
import type { RecordCollectionRef } from "./RecordCollectionRef.js";
import type { Unsubscribe } from "./Unsubscribe.js";

export type DocumentId = Flavored<"DocumentId">;

export const DocumentRefBrand: unique symbol = Symbol("pack:DocumentRef");

export interface DocumentRef<D extends DocumentSchema = DocumentSchema> {
  readonly id: DocumentId;
  readonly schema: D;
  readonly [DocumentRefBrand]: typeof DocumentRefBrand;

  readonly getDocSnapshot: () => Promise<DocumentState<D>>;
  readonly getRecords: <R extends Model>(model: R) => RecordCollectionRef<R>;
  readonly onMetadataChange: (
    callback: (docId: DocumentRef<D>, metadata: DocumentMetadata) => void,
  ) => Unsubscribe;
  readonly onStateChange: (
    callback: (docRef: DocumentRef<D>) => void,
  ) => Unsubscribe;
  readonly withTransaction: (fn: () => void, description?: EditDescription) => void;
}
