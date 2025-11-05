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
import type { DocumentRef } from "./DocumentRef.js";
import type { Model, ModelData } from "./Model.js";
import type { Unsubscribe } from "./Unsubscribe.js";

export type RecordId = Flavored<"RecordId">;

export const RecordRefBrand: unique symbol = Symbol("pack:RecordRef");

export interface RecordRef<M extends Model = Model> {
  readonly docRef: DocumentRef;
  readonly id: RecordId;
  readonly model: M;
  readonly [RecordRefBrand]: typeof RecordRefBrand;

  getSnapshot(): Promise<ModelData<M>>;
  onChange(callback: (snapshot: ModelData<M>, recordRef: RecordRef<M>) => void): Unsubscribe;
  onDeleted(callback: (recordRef: RecordRef<M>) => void): Unsubscribe;
  set(record: ModelData<M>): Promise<void>;
}
