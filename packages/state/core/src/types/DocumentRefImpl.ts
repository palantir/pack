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

import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  DocumentState,
  Model,
  RecordCollectionRef,
  Unsubscribe,
} from "@palantir/pack.document-schema.model-types";
import { DocumentRefBrand } from "@palantir/pack.document-schema.model-types";
import type { StateModuleImpl } from "./StateModule.js";
import { getStateModule } from "./StateModule.js";

const INVALID_DOC_REF_ID: DocumentId = "INVALID_DOC_REF";
const INVALID_DOC_REF: DocumentRef = Object.freeze(
  {
    id: INVALID_DOC_REF_ID,
    schema: {} as DocumentSchema,
    [DocumentRefBrand]: DocumentRefBrand,
    getDocSnapshot: () => Promise.reject(new Error("Invalid document reference")),
    getRecords: () => {
      throw new Error("Invalid document reference");
    },
    onMetadataChange: () => () => {},
    onStateChange: () => () => {},
  } as const,
);

export const createDocRef = <const D extends DocumentSchema>(
  app: PackAppInternal,
  id: DocumentId,
  schema: D,
): DocumentRef<D> => {
  return new DocumentRefImpl(app, id, schema);
};

export function invalidDocRef<D extends DocumentSchema = DocumentSchema>(): DocumentRef<D> {
  return INVALID_DOC_REF as DocumentRef<D>;
}

export function isValidDocRef<D extends DocumentSchema = DocumentSchema>(
  docRef: DocumentRef<D>,
): docRef is DocumentRef<D> {
  return docRef.id !== INVALID_DOC_REF_ID && docRef.id !== "";
}

class DocumentRefImpl<T extends DocumentSchema> implements DocumentRef<T> {
  readonly id: DocumentId;
  readonly schema: T;
  declare readonly [DocumentRefBrand]: typeof DocumentRefBrand;
  readonly #stateModule: StateModuleImpl;

  constructor(app: PackAppInternal, id: DocumentId, schema: T) {
    this.#stateModule = getStateModule(app) as StateModuleImpl;
    this.id = id;
    this.schema = schema;
  }

  async getDocSnapshot(): Promise<DocumentState<T>> {
    return this.#stateModule.getDocumentSnapshot(this);
  }

  getRecords<R extends Model>(
    model: R,
  ): RecordCollectionRef<R> {
    return this.#stateModule.getCreateRecordCollectionRef(this, model);
  }

  onMetadataChange(
    cb: (docRef: DocumentRef<T>, metadata: DocumentMetadata) => void,
  ): Unsubscribe {
    return this.#stateModule.onMetadataChange(this, cb);
  }

  onStateChange(
    callback: (docRef: DocumentRef<T>) => void,
  ): Unsubscribe {
    return this.#stateModule.onStateChange(this, callback);
  }
}
