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

import type { Unsubscribe } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  DocumentState,
  EditDescription,
  Model,
  ModelData,
  RecordCollectionRef,
  RecordId,
  RecordRef,
} from "@palantir/pack.document-schema.model-types";

export const DocumentLoadStatus = {
  UNLOADED: "unloaded", // Not yet loaded
  LOADING: "loading", // Initial load in progress
  LOADED: "loaded", // Successfully loaded
  ERROR: "error", // Load failed
} as const;
export type DocumentLoadStatus = typeof DocumentLoadStatus[keyof typeof DocumentLoadStatus];

export const DocumentLiveStatus = {
  DISCONNECTED: "disconnected", // Not syncing
  CONNECTING: "connecting", // Establishing connection
  CONNECTED: "connected", // Live syncing active
  ERROR: "error", // Connection error
} as const;
export type DocumentLiveStatus = typeof DocumentLiveStatus[keyof typeof DocumentLiveStatus];

export type DocumentSyncStatus = {
  readonly error?: unknown;
  readonly live: DocumentLiveStatus;
  readonly load: DocumentLoadStatus;
};

export type DocumentStatus = {
  readonly metadata: DocumentSyncStatus;
  readonly data: DocumentSyncStatus;
  readonly metadataError?: unknown;
  readonly dataError?: unknown;
};

export type DocumentStatusChangeCallback = (
  docRef: DocumentRef,
  status: DocumentStatus,
) => void;

export type DocumentMetadataChangeCallback<
  T extends DocumentSchema = DocumentSchema,
> = (docRef: DocumentRef<T>, metadata: DocumentMetadata) => void;

export type DocumentStateChangeCallback<
  T extends DocumentSchema = DocumentSchema,
> = (docRef: DocumentRef<T>) => void;

export type RecordCollectionChangeCallback<M extends Model = Model> = (
  items: readonly RecordRef<M>[],
) => void;

export type RecordChangeCallback<M extends Model = Model> = (
  snapshot: ModelData<M>,
  record: RecordRef<M>,
) => void;

export type RecordDeleteCallback<M extends Model = Model> = (
  record: RecordRef<M>,
) => void;

export interface DocumentService {
  readonly hasMetadataSubscriptions: boolean;
  readonly hasStateSubscriptions: boolean;

  readonly createDocument: <T extends DocumentSchema>(
    metadata: DocumentMetadata,
    schema: T,
  ) => Promise<DocumentRef<T>>;

  readonly createDocRef: <const T extends DocumentSchema>(
    id: DocumentId,
    schema: T,
  ) => DocumentRef<T>;

  readonly getCreateRecordCollectionRef: <const M extends Model>(
    docRef: DocumentRef,
    model: M,
  ) => RecordCollectionRef<M>;

  readonly getCreateRecordRef: <const M extends Model>(
    docRef: DocumentRef,
    id: RecordId,
    model: M,
  ) => RecordRef<M>;

  readonly getDocumentSnapshot: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<DocumentState<T>>;

  readonly getRecordSnapshot: <R extends Model>(
    record: RecordRef<R>,
  ) => Promise<ModelData<R>>;

  readonly setRecord: <R extends Model>(
    record: RecordRef<R>,
    state: ModelData<R>,
  ) => Promise<void>;

  readonly updateRecord: <R extends Model>(
    record: RecordRef<R>,
    partialState: Partial<ModelData<R>>,
  ) => Promise<void>;

  readonly withTransaction: (
    docRef: DocumentRef,
    fn: () => void,
    description?: EditDescription,
  ) => void;

  // Collection methods
  readonly getRecord: <M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
  ) => RecordRef<M> | undefined;

  readonly hasRecord: <M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
  ) => boolean;

  readonly setCollectionRecord: <M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
    state: ModelData<M>,
  ) => Promise<void>;

  readonly deleteRecord: <M extends Model>(
    record: RecordRef<M>,
  ) => Promise<void>;

  readonly getCollectionSize: <M extends Model>(
    collection: RecordCollectionRef<M>,
  ) => number;

  readonly getCollectionRecords: <M extends Model>(
    collection: RecordCollectionRef<M>,
  ) => RecordRef<M>[];

  readonly onCollectionItemsAdded: <M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ) => Unsubscribe;

  readonly onCollectionItemsChanged: <M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ) => Unsubscribe;

  readonly onCollectionItemsDeleted: <M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ) => Unsubscribe;

  readonly onMetadataChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentMetadataChangeCallback<T>,
  ) => Unsubscribe;

  readonly onStateChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentStateChangeCallback<T>,
  ) => Unsubscribe;

  readonly onRecordChanged: <M extends Model>(
    record: RecordRef<M>,
    callback: RecordChangeCallback<M>,
  ) => Unsubscribe;

  readonly onRecordDeleted: <M extends Model>(
    record: RecordRef<M>,
    callback: RecordDeleteCallback<M>,
  ) => Unsubscribe;

  // Status methods
  readonly getDocumentStatus: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => DocumentStatus;

  readonly onStatusChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentStatusChangeCallback,
  ) => Unsubscribe;

  readonly waitForMetadataLoad: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<void>;

  readonly waitForDataLoad: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<void>;
}
