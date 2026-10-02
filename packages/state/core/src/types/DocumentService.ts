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
  ActivityEvent,
  ChannelError,
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  DocumentSecurity,
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
import type { CreateDocumentMetadata, FileSystemType } from "./CreateDocumentMetadata.js";

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
  readonly error?: ChannelError;
  readonly invalidRecordCount?: number;
  /**
   * When true, indicates this is a demo/test service not connected to real Foundry.
   * UI can use this to display a badge or indicator that data is local-only.
   */
  readonly isDemo?: boolean;
  readonly live: DocumentLiveStatus;
  readonly load: DocumentLoadStatus;
};

export type DocumentStatus = {
  readonly metadata: DocumentSyncStatus;
  readonly data: DocumentSyncStatus;
  readonly presence: DocumentSyncStatus;
  readonly activity: DocumentSyncStatus;
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

export type RecordInvalidCallback<M extends Model = Model> = (
  error: RecordValidationError,
  record: RecordRef<M>,
) => void;

/**
 * Result of a document search operation, including pagination information.
 */
export interface SearchDocumentsResult {
  readonly data: ReadonlyArray<DocumentMetadata & { readonly id: DocumentId }>;
  readonly nextPageToken?: string;
}

export type DocumentSortField =
  | "NAME"
  | "CREATED_TIME"
  | "LAST_MODIFIED_TIME"
  | "LAST_VIEW_TIME";

export type DocumentSortDirection = "ASC" | "DESC";

export interface DocumentSort {
  readonly direction: DocumentSortDirection;
  readonly field: DocumentSortField;
}

export interface SearchDocumentsOptions {
  readonly documentName?: string;
  readonly ontologyRid?: string;
  readonly orderBy?: DocumentSort;
  readonly pageSize?: number;
  readonly pageToken?: string;
}

/**
 * Metadata for a document type, as loaded from the platform.
 */
export interface DocumentType {
  readonly rid?: string;
  readonly name: string;
  readonly operationalVersion?: number;
  readonly fileSystemType?: FileSystemType;
  readonly owningApplicationId?: string;
}

/**
 * Fields that can be updated on a document's metadata.
 */
export interface UpdateDocumentMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly operationalVersion?: number;
  readonly security?: DocumentSecurity;
}

/**
 * Optional name and description to attach when publishing a document version.
 */
export interface CreatePublishedVersionOptions {
  readonly name?: string;
  readonly description?: string;
}

/**
 * Result of publishing a document version: the newly published version plus any versions that were
 * auto-evicted to keep the document within its published-version limit.
 */
export interface CreatePublishedVersionResult {
  readonly publishedVersion: PublishedVersion;
  readonly autoEvictedPublishedVersions: readonly PublishedVersion[];
}

/**
 * Base interface for specific document service implementations.
 * The DocumentService is responsible for persisting document state,
 * metadata, and providing methods to subscribe and interact with documents.
 *
 * The main implementation communicates with the Foundry platform (see @palantir/pack.state.foundry).
 */
export interface DocumentService {
  readonly hasMetadataSubscriptions: boolean;
  readonly hasStateSubscriptions: boolean;

  readonly createDocument: <T extends DocumentSchema>(
    metadata: CreateDocumentMetadata,
    schema: T,
  ) => Promise<DocumentRef<T>>;

  readonly searchDocuments: <T extends DocumentSchema>(
    documentTypeName: string,
    schema: T,
    options?: SearchDocumentsOptions,
  ) => Promise<SearchDocumentsResult>;

  readonly updateDocument: (
    docRef: DocumentRef,
    metadata: UpdateDocumentMetadata,
  ) => Promise<DocumentMetadata>;

  /**
   * Deletes a document. For Compass-backed documents this moves the document to the trash;
   * for Artifacts-backed documents this archives it. In both cases the document will no longer
   * appear in search results or be loadable, but the operation can be reversed by the owner (
   * api not yet supported).
   */
  readonly deleteDocument: (
    docRef: DocumentRef,
  ) => Promise<void>;

  /**
   * Get the schema operational version a document is currently operating at.
   * Returns the version from the document's metadata if available, falling back
   * to minSupportedVersion from the schema.
   */
  readonly getDocumentSchemaOperationalVersion: (
    docRef: DocumentRef,
  ) => number;

  /**
   * Loads a document type's metadata by its name, scoped to an ontology (defaults to the app's bound
   * ontology). Document types keyed by a global name rather than a rid must be loaded by rid via
   * getDocumentType instead.
   */
  readonly loadDocumentTypeByName: (
    documentTypeName: string,
    ontologyRid?: string,
  ) => Promise<DocumentType>;

  /**
   * Loads a document type's metadata by its rid.
   */
  readonly getDocumentType: (
    documentTypeRid: string,
  ) => Promise<DocumentType>;

  /**
   * Returns the computed operational version for a document type: the highest schema
   * version all deployed asset tracks can support. The ontology defaults to the app's
   * bound ontology when not provided.
   */
  readonly getDocumentTypeOperationalVersion: (
    documentTypeName: string,
    ontologyRid?: string,
  ) => Promise<number | undefined>;

  /**
   * Resolves a document to the application that owns its document type. Returns the owning
   * application id from the type's metadata, or undefined if none is configured.
   */
  readonly resolveDocumentApplication: (
    docRef: DocumentRef,
  ) => Promise<string | undefined>;

  /**
   * Publishes the document's current persisted state as an immutable published version. Republishing
   * an unchanged head returns the existing version. When the document is at its published-version
   * limit, the oldest versions are auto-evicted to make room and reported in the result.
   */
  readonly createPublishedVersion: (
    docRef: DocumentRef,
    options?: CreatePublishedVersionOptions,
  ) => Promise<CreatePublishedVersionResult>;

  /**
   * Lists the document's active published versions, latest-first. Returns an empty array if none
   * exist.
   */
  readonly listPublishedVersions: (
    docRef: DocumentRef,
  ) => Promise<readonly PublishedVersion[]>;

  /**
   * Returns a published version's metadata (name, description, creator, timestamp) by ref, without
   * its content. Rejects with `InvalidPublishedVersionRef` for a malformed ref or
   * `PublishedVersionNotFound` if the version is missing or deleted.
   */
  readonly getPublishedVersion: (
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ) => Promise<PublishedVersion>;

  /**
   * Returns the metadata of the resolved latest active published version, without its content.
   * Rejects with `NoActivePublishedVersion` if the document has no active published version. Use
   * `listPublishedVersions` to check for an empty list without an error.
   */
  readonly getLatestPublishedVersion: (
    docRef: DocumentRef,
  ) => Promise<PublishedVersion>;

  /**
   * Returns a published version's frozen content by ref as a merged binary Yjs update. Apply it to a
   * fresh `Y.Doc` via `Y.applyUpdate` to reconstruct the document at that version. Rejects with
   * `InvalidPublishedVersionRef` for a malformed ref or `PublishedVersionNotFound` if the version
   * is missing or deleted.
   */
  readonly getPublishedVersionContents: (
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ) => Promise<Uint8Array>;

  /**
   * Returns the resolved latest active published version's frozen content as a merged binary Yjs
   * update. Apply it to a fresh `Y.Doc` via `Y.applyUpdate` to reconstruct the document.
   * Rejects with `NoActivePublishedVersion` if the document has no active published version.
   */
  readonly getLatestPublishedVersionContents: (
    docRef: DocumentRef,
  ) => Promise<Uint8Array>;

  /**
   * Deletes a published version so it can no longer be listed or loaded. Safe to repeat.
   */
  readonly deletePublishedVersion: (
    docRef: DocumentRef,
    ref: PublishedVersionRef,
  ) => Promise<void>;

  /**
   * Loads a published version as a read-only {@link PublishedVersionDocumentRef} with its own frozen
   * copy of the document. Rejects with `InvalidPublishedVersionRef` or `PublishedVersionNotFound`
   * for a bad or missing ref.
   */
  readonly loadPublishedVersionDocRef: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    ref: PublishedVersionRef,
  ) => Promise<PublishedVersionDocumentRef<T>>;

  /**
   * Loads the latest published version as a read-only {@link PublishedVersionDocumentRef}. The
   * contents are loaded by the resolved version's ref, so a publish in between can't mix up two
   * versions. Rejects with `NoActivePublishedVersion` when none exist.
   */
  readonly loadLatestPublishedVersionDocRef: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
  ) => Promise<PublishedVersionDocumentRef<T>>;

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

  readonly onActivity: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: ActivityEvent) => void,
  ) => Unsubscribe;

  readonly onMetadataChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentMetadataChangeCallback<T>,
  ) => Unsubscribe;

  readonly onPresence: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: (docRef: DocumentRef<T>, event: PresenceEvent) => void,
    options?: PresenceSubscriptionOptions,
  ) => Unsubscribe;

  readonly onStateChange: <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentStateChangeCallback<T>,
  ) => Unsubscribe;

  readonly updateCustomPresence: <M extends Model>(
    docRef: DocumentRef,
    model: M,
    eventData: ModelData<M>,
    options?: PresencePublishOptions,
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
