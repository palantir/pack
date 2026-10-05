/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

import type { PackAppInternal, Unsubscribe } from "@palantir/pack.core";
import type {
  DocumentRef,
  DocumentSchema,
  PublishedVersion,
  PublishedVersionDocumentRef,
} from "@palantir/pack.document-schema.model-types";
import invariant from "tiny-invariant";
import * as Y from "yjs";
import type { CreateDocumentMetadata } from "../types/CreateDocumentMetadata.js";
import {
  createPublishedVersionDocRef,
  isValidDocRef,
  PUBLISHED_VERSION_READ_ONLY_MESSAGE,
} from "../types/DocumentRefImpl.js";
import type {
  DocumentMetadataChangeCallback,
  DocumentService,
  DocumentStatus,
  DocumentStatusChangeCallback,
  DocumentSyncStatus,
} from "../types/DocumentService.js";
import { DocumentLiveStatus, DocumentLoadStatus } from "../types/DocumentService.js";
import type { InternalYjsDoc } from "./BaseYjsDocumentService.js";
import { BaseYjsDocumentService } from "./BaseYjsDocumentService.js";

/**
 * Opens a downloaded published version as a read-only doc ref. It loads the contents (a Yjs
 * update) into a new {@link PublishedVersionDocumentService} and returns a ref that reads from it.
 * Metadata and the schema version come from the live draft. `docRef` can be the live draft ref or
 * a published version doc ref for the same document. Throws if the contents can't be applied.
 */
export function openPublishedVersionDocRef<T extends DocumentSchema>(
  app: PackAppInternal,
  liveDraftService: DocumentService,
  docRef: DocumentRef<T>,
  contents: Uint8Array,
  publishedVersion: PublishedVersion,
): PublishedVersionDocumentRef<T> {
  if (!isValidDocRef(docRef)) {
    throw new Error("Invalid document reference");
  }
  // Always use the live draft's own ref. Passing a published version doc ref to the live draft
  // service could make it store that read-only ref as the document's ref.
  const liveDraftRef = liveDraftService.createDocRef(docRef.id, docRef.schema);
  const service = new PublishedVersionDocumentService(app, liveDraftService, liveDraftRef);
  const publishedRef = createPublishedVersionDocRef(
    app,
    liveDraftRef.id,
    liveDraftRef.schema,
    publishedVersion,
    service,
  );
  service.load(publishedRef, contents);
  return publishedRef;
}

/**
 * The read-only document service behind a published version doc ref, one per opened version. It
 * holds that version's frozen Y.Doc and reuses the base class read path. Writes reject, presence
 * and activity are no-ops, and nothing connects to the server. Metadata, its load status, and the
 * schema version come from the live draft document.
 */
class PublishedVersionDocumentService extends BaseYjsDocumentService {
  constructor(
    app: PackAppInternal,
    private readonly liveDraftService: DocumentService,
    private readonly liveDraftRef: DocumentRef,
  ) {
    super(
      app,
      app.config.logger.child({}, { level: "debug", msgPrefix: "PublishedVersionDocumentService" }),
      { isDemo: app.config.isDemoMode },
    );
  }

  /** Loads the snapshot into this service's Y.Doc. Throws if the contents can't be applied. */
  load(publishedRef: DocumentRef, contents: Uint8Array): void {
    const yDoc = this.initializeYDoc(publishedRef.schema);
    Y.applyUpdate(yDoc, contents);
    this.getCreateInternalDoc(publishedRef, undefined, yDoc);
  }

  get hasMetadataSubscriptions(): boolean {
    // Metadata subscriptions are forwarded to the live draft document.
    return false;
  }

  get hasStateSubscriptions(): boolean {
    return Array.from(this.documents.values()).some(doc => doc.docStateSubscribers.size > 0);
  }

  // `yDoc` is the snapshot that `load` filled in.
  protected createInternalDoc(
    ref: DocumentRef,
    _metadata: CreateDocumentMetadata | undefined,
    yDoc: Y.Doc | undefined,
  ): InternalYjsDoc {
    invariant(yDoc != null, "Published version contents are required to load it");
    const loaded: DocumentSyncStatus = {
      isDemo: this.isDemo,
      live: DocumentLiveStatus.DISCONNECTED,
      load: DocumentLoadStatus.LOADED,
    };
    return { ...this.createBaseInternalDoc(ref, undefined), dataStatus: loaded, yDoc };
  }

  // Metadata comes from the live draft, so its load status and errors do too. Data status stays
  // this copy's own.
  protected override buildStatus(internalDoc: InternalYjsDoc): DocumentStatus {
    return {
      ...super.buildStatus(internalDoc),
      metadata: this.liveDraftService.getDocumentStatus(this.liveDraftRef).metadata,
    };
  }

  override readonly onStatusChange = <T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentStatusChangeCallback,
  ): Unsubscribe => {
    const { internalDoc } = this.getCreateInternalDoc(docRef);
    // Changes to this copy's own status reach the callback through the base class.
    internalDoc.statusSubscribers.add(callback);
    // Changes to the live draft's status re-send this copy's status. This also sends it right away.
    const unsubscribeLiveDraft = this.liveDraftService.onStatusChange(this.liveDraftRef, () => {
      callback(docRef, this.buildStatus(internalDoc));
    });
    return () => {
      internalDoc.statusSubscribers.delete(callback);
      unsubscribeLiveDraft();
    };
  };

  override readonly waitForMetadataLoad = (): Promise<void> => {
    return this.liveDraftService.waitForMetadataLoad(this.liveDraftRef);
  };

  // The snapshot is already in memory. The base class marks data unloaded when the last subscriber
  // leaves, so mark it loaded again when a new one arrives.
  protected onDataSubscriptionOpened(internalDoc: InternalYjsDoc, docRef: DocumentRef): void {
    this.updateDataStatus(internalDoc, docRef, { load: DocumentLoadStatus.LOADED });
  }

  protected onDataSubscriptionClosed(): void {}

  protected onMetadataSubscriptionOpened(): void {}

  protected onMetadataSubscriptionClosed(): void {}

  override readonly setRecord = rejectReadOnly;

  override readonly updateRecord = rejectReadOnly;

  override readonly deleteRecord = rejectReadOnly;

  override readonly withTransaction = (): void => {
    throw new Error(PUBLISHED_VERSION_READ_ONLY_MESSAGE);
  };

  override onMetadataChange<T extends DocumentSchema>(
    docRef: DocumentRef<T>,
    callback: DocumentMetadataChangeCallback<T>,
  ): Unsubscribe {
    // Report the live draft's metadata, passing back the ref the caller subscribed with.
    return this.liveDraftService.onMetadataChange(this.liveDraftRef, (_liveDraftRef, metadata) => {
      callback(docRef, metadata);
    });
  }

  override readonly getDocumentSchemaOperationalVersion = (): number => {
    return this.liveDraftService.getDocumentSchemaOperationalVersion(this.liveDraftRef);
  };

  onActivity(): Unsubscribe {
    return () => {};
  }

  onPresence(): Unsubscribe {
    return () => {};
  }

  updateCustomPresence(): void {}

  // app.state routes document-level writes made with a published version doc ref here, so they
  // reject too.
  readonly updateDocument = rejectReadOnly;
  readonly deleteDocument = rejectReadOnly;
  readonly createPublishedVersion = rejectReadOnly;
  readonly deletePublishedVersion = rejectReadOnly;

  // Other document-level calls always go to the app's document service, never to this one.
  readonly createDocument = rejectNotSupported("createDocument");
  readonly searchDocuments = rejectNotSupported("searchDocuments");
  readonly loadDocumentTypeByName = rejectNotSupported("loadDocumentTypeByName");
  readonly getDocumentType = rejectNotSupported("getDocumentType");
  readonly getDocumentTypeOperationalVersion = rejectNotSupported(
    "getDocumentTypeOperationalVersion",
  );
  readonly resolveDocumentApplication = rejectNotSupported("resolveDocumentApplication");
  readonly listPublishedVersions = rejectNotSupported("listPublishedVersions");
  readonly getPublishedVersion = rejectNotSupported("getPublishedVersion");
  readonly getLatestPublishedVersion = rejectNotSupported("getLatestPublishedVersion");
  readonly getPublishedVersionContents = rejectNotSupported("getPublishedVersionContents");
  readonly getLatestPublishedVersionContents = rejectNotSupported(
    "getLatestPublishedVersionContents",
  );
  readonly loadPublishedVersionDocRef = rejectNotSupported("loadPublishedVersionDocRef");
  readonly loadLatestPublishedVersionDocRef = rejectNotSupported(
    "loadLatestPublishedVersionDocRef",
  );
}

function rejectReadOnly(): Promise<never> {
  return Promise.reject(new Error(PUBLISHED_VERSION_READ_ONLY_MESSAGE));
}

// TODO: Share this with the in-memory and demo services, which still write out each "not supported"
// rejection. Wait until the published versions branch merges, since it adds stubs next to theirs.
function rejectNotSupported(operation: string): () => Promise<never> {
  return () =>
    Promise.reject(new Error(`${operation} is not supported on a published document version`));
}
