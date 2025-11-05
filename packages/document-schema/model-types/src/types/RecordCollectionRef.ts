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

import type { DocumentRef } from "./DocumentRef.js";
import type { Model, ModelData } from "./Model.js";
import type { RecordId, RecordRef } from "./RecordRef.js";

export const RecordCollectionRefBrand: unique symbol = Symbol(
  "pack:RecordCollectionRef",
);

export interface RecordCollectionRef<M extends Model = Model> {
  readonly docRef: DocumentRef;
  readonly model: M;
  readonly [RecordCollectionRefBrand]: typeof RecordCollectionRefBrand;

  delete(id: RecordId): Promise<void>;
  get(id: RecordId): RecordRef<M> | undefined;
  has(id: RecordId): boolean;
  set(id: RecordId, state: ModelData<M>): Promise<void>;
  readonly size: number;

  [Symbol.iterator](): Iterator<RecordRef<M>>;

  readonly onItemsAdded: (
    callback: (items: readonly RecordRef<M>[]) => void,
  ) => () => void;

  readonly onItemsChanged: (
    callback: (items: readonly RecordRef<M>[]) => void,
  ) => () => void;

  readonly onItemsDeleted: (
    callback: (items: readonly RecordRef<M>[]) => void,
  ) => () => void;
}
