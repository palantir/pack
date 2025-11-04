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
  Model,
  ModelData,
  RecordId,
  RecordRef,
  Unsubscribe,
} from "@palantir/pack.document-schema.model-types";
import { RecordRefBrand } from "@palantir/pack.document-schema.model-types";
import { invalidDocRef } from "./DocumentRefImpl.js";
import type { DocumentService } from "./DocumentService.js";

const INVALID_RECORD_ID: RecordId = "INVALID_RECORD_REF";
const INVALID_RECORD_REF: RecordRef = Object.freeze(
  {
    docRef: invalidDocRef(),
    id: INVALID_RECORD_ID,
    model: {} as Model,
    [RecordRefBrand]: RecordRefBrand,
    getSnapshot: () => Promise.reject(new Error("Invalid record reference")),
    set: () => Promise.reject(new Error("Invalid record reference")),
    onChange: () => () => {},
    onDeleted: () => () => {},
  } as const,
);

export const createRecordRef = <const M extends Model>(
  documentService: DocumentService,
  docRef: DocumentRef,
  id: RecordId,
  model: M,
): RecordRef<M> => {
  return new RecordRefImpl(documentService, docRef, id, model);
};

export function invalidRecordRef<M extends Model = Model>(): RecordRef<M> {
  return INVALID_RECORD_REF as RecordRef<M>;
}

export function isValidRecordRef<M extends Model = Model>(
  recordRef: RecordRef<M>,
): recordRef is RecordRef<M> {
  return recordRef.id !== INVALID_RECORD_ID;
}

class RecordRefImpl<M extends Model> implements RecordRef<M> {
  readonly docRef: DocumentRef;
  readonly id: RecordId;
  readonly model: M;
  declare readonly [RecordRefBrand]: typeof RecordRefBrand;
  readonly #documentService: DocumentService;

  constructor(
    documentService: DocumentService,
    docRef: DocumentRef,
    id: RecordId,
    model: M,
  ) {
    this.#documentService = documentService;
    this.docRef = docRef;
    this.id = id;
    this.model = model;
  }

  async getSnapshot(): Promise<ModelData<M>> {
    return this.#documentService.getRecordSnapshot(this);
  }

  onChange(
    callback: (snapshot: ModelData<M>, recordRef: RecordRef<M>) => void,
  ): Unsubscribe {
    return this.#documentService.onRecordChanged(this, callback);
  }

  onDeleted(callback: (recordRef: RecordRef<M>) => void): Unsubscribe {
    return this.#documentService.onRecordDeleted(this, callback);
  }

  delete(): Promise<void> {
    return this.#documentService.deleteRecord(this);
  }

  set(record: ModelData<M>): Promise<void> {
    return this.#documentService.setRecord(this, record);
  }

  update(partialRecord: Partial<ModelData<M>>): Promise<void> {
    return this.#documentService.updateRecord(this, partialRecord);
  }
}
