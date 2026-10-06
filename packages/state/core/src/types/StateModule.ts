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

import type { ModuleKey, PackApp, PackAppInternal, Unsubscribe } from "@palantir/pack.core";
import { assertIsAppInternal } from "@palantir/pack.core";
import type {
  ActivityEvent,
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  DocumentState,
  EditDescription,
  Model,
  ModelData,
  PresenceEvent,
  PresencePublishOptions,
  PresenceSubscriptionOptions,
  PublishedVersion,
  PublishedVersionDocumentRef,
  PublishedVersionRef,
  RecordCollectionRef,
  RecordId,
  RecordRef,
  RecordValidationError,
} from "@palantir/pack.document-schema.model-types";
import { getMetadata } from "@palantir/pack.document-schema.model-types";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { CreateDocumentMetadata } from "./CreateDocumentMetadata.js";
import type {
  CreatePublishedVersionOptions,
  CreatePublishedVersionResult,
  DocumentService,
  DocumentType,
  RecordChangeCallback,
  RecordCollectionChangeCallback,
  RecordDeleteCallback,
  RecordInvalidCallback,
  SearchDocumentsOptions,
  SearchDocumentsResult,
  UpdateDocumentMetadata,
} from "./DocumentService.js";
import { getPublishedVersionDocumentService } from "./PublishedVersionDocRefRegistry.js";

// Ensure state module is accessible on PackApp instances.
export const STATE_MODULE_ACCESSOR = "state";
export const STATE_MODULE_KEY: ModuleKey<StateModuleImpl> = {
  appMemberName: STATE_MODULE_ACCESSOR,
  key: Symbol.for("pack.state"),
  initModule: (app: PackAppInternal) => {
    const documentService = app.getModule(DOCUMENT_SERVICE_MODULE_KEY);
    return new StateModuleImpl(documentService);
  },
};
export type WithStateModule<T> = T & { readonly [STATE_MODULE_ACCESSOR]: StateModule };

export interface StateModule {
  readonly createDocRef: <const T extends DocumentSchema>(
    id: DocumentId,
    schema: T,
  ) => DocumentRef<T>;

  readonly createRecordRef: <const M extends Model>(
    docRef: DocumentRef,
    id: RecordId,
    model: M,
  ) => RecordRef<M>;

  readonly createDocument: {
    <T extends DocumentSchema>(
      metadata: CreateDocumentMetadata,
      schema: T,
    ): Promise<DocumentRef<T>>;
    <T extends DocumentSchema>(
      metadata: CreateDocumentMetadata,
      schema: T,
      initializer: (docRef: DocumentRef<T>, version: number) => void | Promise<void>,
    ): Promise<DocumentRef<T>>;
  };

  readonly searchDocuments: <T extends DocumentSchema>(
    documentTypeName: string,
    schema: T,
    options?: SearchDocumentsOptions,
  ) => Promise<SearchDocumentsResult>;

  /** Rejects for a published version doc ref, which is read-only. Use the live draft ref. */
  readonly updateDocument: (
    docRef: DocumentRef,
    metadata: UpdateDocumentMetadata,
  ) => Promise<DocumentMetadata>;

  /** Rejects for a published version doc ref, which is read-only. Use the live draft ref. */
  readonly deleteDocument: (
    docRef: DocumentRef,
  ) => Promise<void>;

  readonly loadDocumentTypeByName: (
    documentTypeName: string,
    ontologyRid?: string,
  ) => Promise<DocumentType>;

  readonly getDocumentType: (
    documentTypeRid: string,
  ) => Promise<DocumentType>;

  readonly getDocumentTypeOperationalVersion: (
    documentTypeName: string,
    ontologyRid?: string,
  ) => Promise<number | undefined>;

  readonly resolveDocumentApplication: (
    docRef: DocumentRef,
  ) => Promise<string | undefined>;

  /** Rejects for a published version doc ref, which is read-only. Use the live draft ref. */
  readonly createPublishedVersion: (
    docRef: DocumentRef,
    options?: CreatePublishedVersionOptions,
  ) => Promise<CreatePublishedVersionResult>;

  /** Returns an empty array when the document has no active published versions. */
  readonly listPublishedVersions: (
    docRef: DocumentRef,
  ) => Promise<readonly PublishedVersion[]>;

  /** Rejects with `InvalidPublishedVersionRef` or `PublishedVersionNotFound` for a bad or missing ref. */
  readonly getPublishedVersion: (
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ) => Promise<PublishedVersion>;

  /** Rejects with `NoActivePublishedVersion` when none exist; use `listPublishedVersions` to check. */
  readonly getLatestPublishedVersion: (
    docRef: DocumentRef,
  ) => Promise<PublishedVersion>;

  /** Rejects for a published version doc ref, which is read-only. Use the live draft ref. */
  readonly deletePublishedVersion: (
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ) => Promise<void>;

  /**
   * Loads a published version as a read-only {@link PublishedVersionDocumentRef}. Rejects with
   * `InvalidPublishedVersionRef` or `PublishedVersionNotFound` for a bad or missing ref.
   */
  readonly loadPublishedVersionDocRef: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    ref: PublishedVersionRef,
  ) => Promise<PublishedVersionDocumentRef<T>>;

  /**
   * Loads the latest published version as a read-only {@link PublishedVersionDocumentRef}. Rejects
   * with `NoActivePublishedVersion` when none exist.
   */
  readonly loadLatestPublishedVersionDocRef: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<PublishedVersionDocumentRef<T>>;

  readonly getDocumentSnapshot: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<DocumentState<T>>;

  readonly onActivity: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ) => Unsubscribe;

  readonly onMetadataChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    cb: (docRef: DocumentRef<T>, metadata: DocumentMetadata) => void,
  ) => Unsubscribe;

  readonly onPresence: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: PresenceEvent) => void,
    options?: PresenceSubscriptionOptions,
  ) => Unsubscribe;

  readonly onStateChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    cb: (docRef: DocumentRef<T>) => void,
  ) => Unsubscribe;

  readonly updateCustomPresence: (
    docRef: DocumentRef,
    model: Model,
    eventData: never,
    options?: PresencePublishOptions,
  ) => void;

  readonly getRecordSnapshot: <R extends Model>(
    recordRef: RecordRef<R>,
  ) => Promise<ModelData<R>>;

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

  readonly setRecord: <R extends Model>(
    recordRef: RecordRef<R>,
    state: ModelData<R>,
  ) => Promise<void>;

  readonly setCollectionRecord: <M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
    state: ModelData<M>,
  ) => Promise<void>;

  readonly updateRecord: <R extends Model>(
    recordRef: RecordRef<R>,
    partialState: Partial<ModelData<R>>,
  ) => Promise<void>;

  readonly withTransaction: (
    docRef: DocumentRef,
    fn: () => void,
    description?: EditDescription,
  ) => void;

  readonly onRecordChanged: <M extends Model>(
    record: RecordRef<M>,
    callback: RecordChangeCallback<M>,
  ) => Unsubscribe;

  readonly onRecordDeleted: <M extends Model>(
    record: RecordRef<M>,
    callback: RecordDeleteCallback<M>,
  ) => Unsubscribe;

  readonly onRecordInvalid: <M extends Model>(
    record: RecordRef<M>,
    callback: RecordInvalidCallback<M>,
  ) => Unsubscribe;

  readonly getInvalidRecords: (
    docRef: DocumentRef,
  ) => ReadonlyArray<RecordValidationError>;

  readonly deleteRecord: <M extends Model>(
    record: RecordRef<M>,
  ) => Promise<void>;

  // Status methods
  readonly getDocumentStatus: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => ReturnType<DocumentService["getDocumentStatus"]>;

  readonly onStatusChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: Parameters<DocumentService["onStatusChange"]>[1],
  ) => Unsubscribe;

  readonly waitForMetadataLoad: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<void>;

  readonly waitForDataLoad: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<void>;
}

export class StateModuleImpl implements StateModule {
  constructor(
    private readonly documentService: DocumentService,
  ) {}

  // Published version doc refs keep their snapshot in their own read-only service, so calls for
  // them (and for their records and collections) go there instead of the app's document service.
  private serviceFor(docRef: DocumentRef): DocumentService {
    const publishedVersionService = getPublishedVersionDocumentService(docRef);
    if (publishedVersionService != null) {
      return publishedVersionService;
    }
    // Every published version doc ref the SDK creates is added to the registry. One that has
    // `publishedVersion` but isn't in the registry must be a copy, so fail instead of quietly
    // reading the live draft.
    if ("publishedVersion" in docRef) {
      throw new Error(
        "This published version doc ref is a copy (for example, made with spread or "
          + "structuredClone) and can't be used. Use the ref returned by "
          + "loadPublishedVersionDocRef or loadLatestPublishedVersionDocRef.",
      );
    }
    return this.documentService;
  }

  getDocumentSchemaOperationalVersion(docRef: DocumentRef): number {
    return this.serviceFor(docRef).getDocumentSchemaOperationalVersion(docRef);
  }

  createDocRef<const T extends DocumentSchema>(
    id: DocumentId,
    schema: T,
  ): DocumentRef<T> {
    return this.documentService.createDocRef(id, schema);
  }

  createRecordRef<const M extends Model>(
    docRef: DocumentRef,
    id: RecordId,
    model: M,
  ): RecordRef<M> {
    return this.serviceFor(docRef).getCreateRecordRef(docRef, id, model);
  }

  async createDocument<T extends DocumentSchema>(
    metadata: CreateDocumentMetadata,
    schema: T,
    initializer?: (docRef: DocumentRef<T>, version: number) => void | Promise<void>,
  ): Promise<DocumentRef<T>> {
    const docRef = await this.documentService.createDocument(metadata, schema);
    if (initializer != null) {
      const schemaMetadata = getMetadata(schema);
      const version = schemaMetadata.minSupportedVersion ?? schemaMetadata.version;
      await initializer(docRef, version);
    }
    return docRef;
  }

  async searchDocuments<T extends DocumentSchema>(
    documentTypeName: string,
    schema: T,
    options?: SearchDocumentsOptions,
  ): Promise<SearchDocumentsResult> {
    return this.documentService.searchDocuments(documentTypeName, schema, options);
  }

  async updateDocument(
    docRef: DocumentRef,
    metadata: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata> {
    return this.serviceFor(docRef).updateDocument(docRef, metadata);
  }

  async deleteDocument(
    docRef: DocumentRef,
  ): Promise<void> {
    return this.serviceFor(docRef).deleteDocument(docRef);
  }

  async loadDocumentTypeByName(
    documentTypeName: string,
    ontologyRid?: string,
  ): Promise<DocumentType> {
    return this.documentService.loadDocumentTypeByName(documentTypeName, ontologyRid);
  }

  async getDocumentType(
    documentTypeRid: string,
  ): Promise<DocumentType> {
    return this.documentService.getDocumentType(documentTypeRid);
  }

  async getDocumentTypeOperationalVersion(
    documentTypeName: string,
    ontologyRid?: string,
  ): Promise<number | undefined> {
    return this.documentService.getDocumentTypeOperationalVersion(documentTypeName, ontologyRid);
  }

  async resolveDocumentApplication(
    docRef: DocumentRef,
  ): Promise<string | undefined> {
    return this.documentService.resolveDocumentApplication(docRef);
  }

  async createPublishedVersion(
    docRef: DocumentRef,
    options?: CreatePublishedVersionOptions,
  ): Promise<CreatePublishedVersionResult> {
    return this.serviceFor(docRef).createPublishedVersion(docRef, options);
  }

  async listPublishedVersions(
    docRef: DocumentRef,
  ): Promise<readonly PublishedVersion[]> {
    return this.documentService.listPublishedVersions(docRef);
  }

  async getPublishedVersion(
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ): Promise<PublishedVersion> {
    return this.documentService.getPublishedVersion(docRef, ref);
  }

  async getLatestPublishedVersion(
    docRef: DocumentRef,
  ): Promise<PublishedVersion> {
    return this.documentService.getLatestPublishedVersion(docRef);
  }

  async deletePublishedVersion(
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ): Promise<void> {
    return this.serviceFor(docRef).deletePublishedVersion(docRef, ref);
  }

  async loadPublishedVersionDocRef<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    ref: PublishedVersionRef,
  ): Promise<PublishedVersionDocumentRef<T>> {
    return this.documentService.loadPublishedVersionDocRef(docRef, ref);
  }

  async loadLatestPublishedVersionDocRef<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ): Promise<PublishedVersionDocumentRef<T>> {
    return this.documentService.loadLatestPublishedVersionDocRef(docRef);
  }

  async getDocumentSnapshot<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ): Promise<DocumentState<T>> {
    return this.serviceFor(docRef).getDocumentSnapshot(docRef);
  }

  onActivity<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ): Unsubscribe {
    return this.serviceFor(docRef).onActivity(docRef, callback);
  }

  onMetadataChange<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    cb: (doc: DocumentRef<T>, metadata: DocumentMetadata) => void,
  ): Unsubscribe {
    return this.serviceFor(docRef).onMetadataChange(docRef, cb);
  }

  onPresence<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: PresenceEvent) => void,
    options?: PresenceSubscriptionOptions,
  ): Unsubscribe {
    return this.serviceFor(docRef).onPresence(docRef, callback, options);
  }

  onStateChange<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    cb: (docRef: DocumentRef<T>) => void,
  ): Unsubscribe {
    return this.serviceFor(docRef).onStateChange(docRef, cb);
  }

  updateCustomPresence<M extends Model>(
    docRef: DocumentRef,
    model: M,
    eventData: ModelData<M>,
    options?: PresencePublishOptions,
  ): void {
    this.serviceFor(docRef).updateCustomPresence(docRef, model, eventData, options);
  }

  async getRecordSnapshot<R extends Model>(
    recordRef: RecordRef<R>,
  ): Promise<ModelData<R>> {
    return this.serviceFor(recordRef.docRef).getRecordSnapshot(recordRef);
  }

  async setRecord<R extends Model>(
    recordRef: RecordRef<R>,
    state: ModelData<R>,
  ): Promise<void> {
    return this.serviceFor(recordRef.docRef).setRecord(recordRef, state);
  }

  async updateRecord<R extends Model>(
    recordRef: RecordRef<R>,
    partialState: Partial<ModelData<R>>,
  ): Promise<void> {
    return this.serviceFor(recordRef.docRef).updateRecord(recordRef, partialState);
  }

  withTransaction(
    docRef: DocumentRef,
    fn: () => void,
    description?: EditDescription,
  ): void {
    this.serviceFor(docRef).withTransaction(docRef, fn, description);
  }

  // Collection methods
  getCreateRecordCollectionRef<M extends Model>(
    docRef: DocumentRef,
    model: M,
  ): RecordCollectionRef<M> {
    return this.serviceFor(docRef).getCreateRecordCollectionRef(docRef, model);
  }

  // FIXME: confusing vs createRecordRef
  getRecord<M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
  ): RecordRef<M> | undefined {
    return this.serviceFor(collection.docRef).getRecord(collection, id);
  }

  hasRecord<M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
  ): boolean {
    return this.serviceFor(collection.docRef).hasRecord(collection, id);
  }

  async setCollectionRecord<M extends Model>(
    collection: RecordCollectionRef<M>,
    id: RecordId,
    state: ModelData<M>,
  ): Promise<void> {
    return this.serviceFor(collection.docRef).setCollectionRecord(collection, id, state);
  }

  getCollectionSize<M extends Model>(
    collection: RecordCollectionRef<M>,
  ): number {
    return this.serviceFor(collection.docRef).getCollectionSize(collection);
  }

  getCollectionRecords<M extends Model>(
    collection: RecordCollectionRef<M>,
  ): RecordRef<M>[] {
    return this.serviceFor(collection.docRef).getCollectionRecords(collection);
  }

  onRecordChanged<M extends Model>(
    record: RecordRef<M>,
    callback: RecordChangeCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(record.docRef).onRecordChanged(record, callback);
  }

  onRecordDeleted<M extends Model>(
    record: RecordRef<M>,
    callback: RecordDeleteCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(record.docRef).onRecordDeleted(record, callback);
  }

  onRecordInvalid<M extends Model>(
    record: RecordRef<M>,
    callback: RecordInvalidCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(record.docRef).onRecordInvalid(record, callback);
  }

  getInvalidRecords(
    docRef: DocumentRef,
  ): ReadonlyArray<RecordValidationError> {
    return this.serviceFor(docRef).getInvalidRecords(docRef);
  }

  onCollectionItemsAdded<M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(collection.docRef).onCollectionItemsAdded(collection, callback);
  }

  onCollectionItemsChanged<M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(collection.docRef).onCollectionItemsChanged(collection, callback);
  }

  onCollectionItemsDeleted<M extends Model>(
    collection: RecordCollectionRef<M>,
    callback: RecordCollectionChangeCallback<M>,
  ): Unsubscribe {
    return this.serviceFor(collection.docRef).onCollectionItemsDeleted(collection, callback);
  }

  // Status methods implementation
  getDocumentStatus<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ): ReturnType<DocumentService["getDocumentStatus"]> {
    return this.serviceFor(docRef).getDocumentStatus(docRef);
  }

  onStatusChange<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: Parameters<DocumentService["onStatusChange"]>[1],
  ): Unsubscribe {
    return this.serviceFor(docRef).onStatusChange(docRef, callback);
  }

  async waitForMetadataLoad<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ): Promise<void> {
    return this.serviceFor(docRef).waitForMetadataLoad(docRef);
  }

  async waitForDataLoad<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ): Promise<void> {
    return this.serviceFor(docRef).waitForDataLoad(docRef);
  }

  async deleteRecord<M extends Model>(
    record: RecordRef<M>,
  ): Promise<void> {
    return this.serviceFor(record.docRef).deleteRecord(record);
  }
}

export function getStateModule(app: PackApp | PackAppInternal): StateModule {
  assertIsAppInternal(app);
  return app.getModule(STATE_MODULE_KEY);
}
